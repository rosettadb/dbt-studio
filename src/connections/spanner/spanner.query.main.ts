/* eslint-disable no-continue */
import type { QueryResponseType } from '../../types/backend';
import type { SpannerConnection } from './spanner.shared';
import {
  SPANNER_MAX_JSON_CHARS,
  SPANNER_MAX_ROWS,
} from './spanner.helpers.shared';
import {
  acquireSpannerDatabase,
  spannerErrorText,
  type SpannerLease,
} from './spanner.client.main';

type StatementKind = 'QUERY' | 'DML' | 'DDL';
type Cancellable = (cancel: () => void) => void;
type Rows = QueryResponseType['data'];

/** Result rows are plain objects; the response type expects pg's QueryResult. */
const asRows = (rows: Record<string, any>[]): Rows => rows as unknown as Rows;

const REQUEST_TIMEOUT_MS = 10 * 60_000;
const ABORTED = 10;

/** Splits on `;` outside quotes and comments. */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let quote = '';
  let lineComment = false;
  let blockComment = false;
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];
    if (lineComment) {
      current += char;
      if (char === '\n') lineComment = false;
    } else if (blockComment) {
      current += char;
      if (char === '*' && next === '/') {
        current += next;
        i += 1;
        blockComment = false;
      }
    } else if (quote) {
      current += char;
      if (char === quote && next === quote) {
        current += next;
        i += 1;
      } else if (char === quote) {
        quote = '';
      }
    } else if (char === '-' && next === '-') {
      current += char + next;
      i += 1;
      lineComment = true;
    } else if (char === '/' && next === '*') {
      current += char + next;
      i += 1;
      blockComment = true;
    } else if (char === "'" || char === '"' || char === '`') {
      quote = char;
      current += char;
    } else if (char === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

/** Removes leading whitespace, comments and `@{...}` hints, until none are left. */
function stripLeading(statement: string): string {
  let text = statement;
  for (;;) {
    const stripped = text
      .replace(/^\s+/, '')
      .replace(/^\/\*[\s\S]*?\*\//, '')
      .replace(/^--[^\n]*(?:\n|$)/, '')
      .replace(/^@\{[^}]*\}/, '');
    if (stripped === text) return text;
    text = stripped;
  }
}

/** The statement without comments and string literals, for keyword checks. */
function withoutLiteralsAndComments(statement: string): string {
  return statement
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/'(?:[^'\\]|\\.|'')*'|"(?:[^"\\]|\\.|"")*"|`[^`]*`/g, ' ');
}

export function classify(statement: string): StatementKind {
  const text = stripLeading(statement);
  if (/^(INSERT|UPDATE|DELETE)\b/i.test(text)) return 'DML';
  if (/^(CREATE|ALTER|DROP|GRANT|REVOKE|RENAME|ANALYZE)\b/i.test(text))
    return 'DDL';
  return 'QUERY';
}

const returnsRows = (statement: string): boolean =>
  /\b(THEN\s+RETURN|RETURNING)\b/i.test(withoutLiteralsAndComments(statement));

function jsonText(value: unknown): string {
  const json = JSON.stringify(value, (_key, item) =>
    typeof item === 'bigint' ? item.toString() : item,
  );
  return json.length <= SPANNER_MAX_JSON_CHARS
    ? json
    : `${json.slice(0, SPANNER_MAX_JSON_CHARS)}… [truncated]`;
}

/** One decoded Spanner value as plain JS. Rows are read with `json: false`. */
function plainValue(value: any): any {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : String(value);
  if (typeof value !== 'object') return value;
  if (Buffer.isBuffer(value)) return `<BYTES ${value.length} bytes>`;
  // DATE (SpannerDate) gives YYYY-MM-DD and TIMESTAMP (PreciseDate) full ISO.
  // toISOString() would shift a DATE by the local UTC offset.
  if (value instanceof Date) return value.toJSON();
  if (Array.isArray(value)) {
    // A STRUCT is an array of { name, value } with its own toJSON.
    if (typeof (value as any).toJSON === 'function')
      return Object.fromEntries(
        value.map((field: any, index: number) => [
          field.name || `_${index}`,
          plainValue(field.value),
        ]),
      );
    return value.map(plainValue);
  }
  // INT64, NUMERIC, FLOAT32/64, PG NUMERIC and JSONB wrappers keep their
  // payload in `value`. Plain JSON objects are left alone.
  const keys = Object.keys(value);
  if (
    Object.getPrototypeOf(value) !== Object.prototype &&
    keys.length === 1 &&
    keys[0] === 'value'
  )
    return plainValue(value.value);
  return typeof value.toJSON === 'function' ? value.toJSON() : value;
}

/** A cell that is safe for IPC and query history: a scalar or JSON text. */
function cellValue(value: any): any {
  const plain = plainValue(value);
  return plain !== null && typeof plain === 'object' ? jsonText(plain) : plain;
}

/** Nameless columns become `_<index>`, repeated names get `_2`, `_3`, …. */
export function uniqueColumnNames(
  names: Array<string | null | undefined>,
): string[] {
  const used = new Set<string>();
  return names.map((name, index) => {
    const base = name || `_${index}`;
    let candidate = base;
    for (let suffix = 2; used.has(candidate); suffix += 1)
      candidate = `${base}_${suffix}`;
    used.add(candidate);
    return candidate;
  });
}

function columnsFrom(metadata: any, firstRow?: any[]): string[] | undefined {
  const fields = metadata?.rowType?.fields;
  if (Array.isArray(fields))
    return uniqueColumnNames(fields.map((field: any) => field.name));
  if (firstRow) return uniqueColumnNames(firstRow.map((cell) => cell?.name));
  return undefined;
}

const toRecord = (columns: string[], row: any[]): Record<string, any> =>
  Object.fromEntries(
    columns.map((column, index) => [column, cellValue(row[index]?.value)]),
  );

const toFields = (columns: string[]) =>
  columns.map((name) => ({ name, type: 0 }));

/**
 * Runs a query on a snapshot this function owns, so it can always be ended.
 * Settles exactly once: on the row past the cap, on end, on error, on close or
 * on Stop. A destroyed stream emits only `close`, so the result never waits
 * for `end` or `error` after a destroy.
 */
async function runQuery(
  database: any,
  sql: string,
  onCancelable?: Cancellable,
): Promise<QueryResponseType> {
  const [snapshot] = await database.getSnapshot();
  let stream: any;
  try {
    return await new Promise<QueryResponseType>((resolve, reject) => {
      const rows: Record<string, any>[] = [];
      let columns: string[] | undefined;
      let settled = false;
      const settle = (result: QueryResponseType) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      const succeed = (truncated: boolean) =>
        settle({
          success: true,
          data: asRows(rows),
          fields: toFields(columns ?? []),
          rowCount: rows.length,
          ...(truncated && { truncated }),
        });
      onCancelable?.(() =>
        settle({ success: false, error: 'Query cancelled.' }),
      );
      stream = snapshot.runStream({
        sql,
        json: false,
        requestOptions: { requestTag: 'dbt-studio' },
        gaxOptions: { timeout: REQUEST_TIMEOUT_MS },
      });
      stream.on('response', (response: any) => {
        columns = columns ?? columnsFrom(response?.metadata);
      });
      stream.on('data', (row: any[]) => {
        if (settled) return;
        columns = columns ?? columnsFrom(undefined, row) ?? [];
        // One row past the cap means the result was cut off.
        if (rows.length === SPANNER_MAX_ROWS) {
          succeed(true);
          return;
        }
        rows.push(toRecord(columns, row));
      });
      stream.on('end', () => succeed(false));
      stream.on('error', fail);
      stream.on('close', () =>
        fail(new Error('The Spanner query stream closed before it finished.')),
      );
    });
  } finally {
    // Destroying the stream cancels a running gRPC call; ending the snapshot
    // releases its session.
    stream?.destroy();
    snapshot.end();
  }
}

/**
 * Runs DML in a read-write transaction and commits it. The SDK runner doesn't
 * roll back a transaction whose work fails, and an open one blocks schema
 * changes on the emulator, so roll back here, except on ABORTED: Spanner has
 * already ended that transaction and the runner retries with a new one.
 */
function runInTransaction<T>(
  database: any,
  onCancelable: Cancellable | undefined,
  work: (tx: any) => Promise<T>,
): Promise<T> {
  let current: any;
  onCancelable?.(() => current?.rollback?.().catch(() => undefined));
  return database.runTransactionAsync(async (tx: any) => {
    current = tx;
    let result: T;
    try {
      result = await work(tx);
    } catch (error: any) {
      if (error?.code !== ABORTED && error?.code !== 'ABORTED')
        await tx.rollback().catch(() => undefined);
      throw error;
    }
    await tx.commit();
    return result;
  });
}

async function runDml(
  database: any,
  sql: string,
  onCancelable?: Cancellable,
): Promise<QueryResponseType> {
  if (!returnsRows(sql)) {
    const [rowCount] = await runInTransaction<[number]>(
      database,
      onCancelable,
      (tx) =>
        tx.runUpdate({ sql, gaxOptions: { timeout: REQUEST_TIMEOUT_MS } }),
    );
    return {
      success: true,
      isCommand: true,
      commandType: 'DML',
      rowCount: Number(rowCount || 0),
    };
  }
  const { returned, metadata } = await runInTransaction<{
    returned: any[][];
    metadata: unknown;
  }>(database, onCancelable, async (tx) => {
    const [rows, , meta] = await tx.run({
      sql,
      json: false,
      gaxOptions: { timeout: REQUEST_TIMEOUT_MS },
    });
    return { returned: (rows || []) as any[][], metadata: meta };
  });
  const columns = columnsFrom(metadata, returned[0]) ?? [];
  const data = asRows(
    returned.slice(0, SPANNER_MAX_ROWS).map((row) => toRecord(columns, row)),
  );
  return {
    success: true,
    isCommand: false,
    data,
    fields: toFields(columns),
    rowCount: data?.length ?? 0,
    ...(returned.length > SPANNER_MAX_ROWS && { truncated: true }),
  };
}

async function runDdl(
  database: any,
  statements: string[],
  onCancelable?: Cancellable,
): Promise<QueryResponseType> {
  let stopWaiting!: () => void;
  const stopped = new Promise<'stopped'>((resolve) => {
    stopWaiting = () => resolve('stopped');
  });
  onCancelable?.(stopWaiting);
  const [operation] = await database.updateSchema(statements);
  const outcome = await Promise.race([
    Promise.resolve(operation.promise()).then(() => 'done' as const),
    stopped,
  ]);
  if (outcome === 'stopped') {
    const id = operation?.name ? ` (${operation.name})` : '';
    return {
      success: false,
      isCommand: false,
      commandType: 'DDL',
      error: `Stopped waiting locally. The Spanner schema change may still complete${id}; refresh the schema and verify the result before retrying.`,
    };
  }
  return { success: true, isCommand: true, commandType: 'DDL' };
}

export async function testSpannerConnection(
  conn: SpannerConnection,
): Promise<boolean> {
  let lease: SpannerLease | undefined;
  try {
    lease = await acquireSpannerDatabase(conn);
    await lease.database.run({
      sql: 'SELECT 1 AS connection_test',
      json: true,
    });
    return true;
  } catch (error) {
    throw new Error(spannerErrorText(error));
  } finally {
    lease?.release();
  }
}

export async function executeSpannerQuery(
  conn: SpannerConnection,
  sql: string,
  onCancelable?: Cancellable,
): Promise<QueryResponseType> {
  let lease: SpannerLease | undefined;
  try {
    lease = await acquireSpannerDatabase(conn);
    const { database } = lease;
    const statements = splitStatements(sql);
    if (
      statements.length > 1 &&
      !statements.every((statement) => classify(statement) === 'DDL')
    )
      throw new Error(
        'Spanner runs one statement at a time. Select a single statement.',
      );
    const statement = statements[0] ?? sql;
    switch (classify(statement)) {
      case 'DDL':
        return await runDdl(database, statements, onCancelable);
      case 'DML':
        return await runDml(database, statement, onCancelable);
      default:
        return await runQuery(database, statement, onCancelable);
    }
  } catch (error) {
    return { success: false, error: spannerErrorText(error) };
  } finally {
    lease?.release();
  }
}
