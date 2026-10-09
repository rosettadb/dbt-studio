/* eslint-disable no-continue, no-use-before-define */
import type {
  ConnectionInput,
  QueryResponseType,
  SpannerConnection,
  SpannerDialect,
} from '../../types/backend';
import { SPANNER_MAX_ROWS, SPANNER_MAX_JSON_CHARS } from '../../shared/spanner';
import {
  acquireSpannerDatabase,
  type SpannerDatabaseLease,
} from './spannerClient';

type StatementKind = 'QUERY' | 'DML' | 'DDL';
const ddlNeedsSchemaRefresh = new Map<
  string,
  { status: 'running' | 'complete'; operationId?: string }
>();

function splitStatements(sql: string): string[] {
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
      continue;
    }
    if (blockComment) {
      current += char;
      if (char === '*' && next === '/') {
        current += next;
        i += 1;
        blockComment = false;
      }
      continue;
    }
    if (quote) {
      current += char;
      if (char === quote && next === quote) {
        current += next;
        i += 1;
      } else if (char === quote) quote = '';
      continue;
    }
    if (char === '-' && next === '-') {
      current += char + next;
      i += 1;
      lineComment = true;
      continue;
    }
    if (char === '/' && next === '*') {
      current += char + next;
      i += 1;
      blockComment = true;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      current += char;
      continue;
    }
    if (char === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

function classify(statement: string): StatementKind {
  const normalized = statement
    .replace(/^\s*\/\*[\s\S]*?\*\/\s*/g, '')
    .replace(/^\s*--[^\n]*(?:\n|$)\s*/g, '')
    .replace(/^\s*@\{[^}]*\}\s*/g, '')
    .trimStart();
  if (/^(INSERT|UPDATE|DELETE)\b/i.test(normalized)) return 'DML';
  if (/^(CREATE|ALTER|DROP|GRANT|REVOKE|RENAME|ANALYZE)\b/i.test(normalized))
    return 'DDL';
  return 'QUERY';
}

const QUERY_TIMEOUT_MS = 10 * 60_000;

/**
 * Plain JS value for one decoded Spanner value. Rows are read with
 * `json: false`, so values arrive as the SDK's typed wrappers.
 */
function plainValue(value: any): any {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : String(value);
  if (typeof value !== 'object') return value;
  if (Buffer.isBuffer(value)) return `<BYTES ${value.length} bytes>`;
  // DATE (SpannerDate) gives YYYY-MM-DD; TIMESTAMP (PreciseDate) gives full
  // ISO. toISOString() would shift a DATE by the local UTC offset.
  if (value instanceof Date) return value.toJSON();
  if (Array.isArray(value)) {
    // STRUCT values are arrays of { name, value } with their own toJSON.
    if (typeof (value as any).toJSON === 'function') {
      return Object.fromEntries(
        value.map((field: any, index: number) => [
          field.name || `_${index}`,
          plainValue(field.value),
        ]),
      );
    }
    return value.map(plainValue);
  }
  // Typed wrappers (INT64, NUMERIC, FLOAT64, FLOAT32, PG NUMERIC, JSONB) keep
  // their payload in `value`. Plain JSON objects are returned as they are.
  const keys = Object.keys(value);
  if (
    Object.getPrototypeOf(value) !== Object.prototype &&
    keys.length === 1 &&
    keys[0] === 'value'
  ) {
    return plainValue(value.value);
  }
  return typeof value.toJSON === 'function' ? value.toJSON() : value;
}

/** Cell value that is safe for IPC and query history: a scalar or JSON text. */
function cellValue(value: any): any {
  const plain = plainValue(value);
  return plain !== null && typeof plain === 'object' ? safeJson(plain) : plain;
}

/**
 * Result column names: nameless columns become `_<index>` (the SDK's own
 * convention) and repeated names get `_2`, `_3`, ... so no column is lost.
 */
function uniqueColumnNames(names: Array<string | null | undefined>): string[] {
  const used = new Set<string>();
  return names.map((name, index) => {
    const base = name || `_${index}`;
    let candidate = base;
    for (let suffix = 2; used.has(candidate); suffix += 1) {
      candidate = `${base}_${suffix}`;
    }
    used.add(candidate);
    return candidate;
  });
}

/** Column names from result metadata, or from the first row if needed. */
function columnsFrom(metadata: any, firstRow?: any[]): string[] | undefined {
  const fields = metadata?.rowType?.fields;
  if (Array.isArray(fields)) {
    return uniqueColumnNames(fields.map((field: any) => field.name));
  }
  if (firstRow) return uniqueColumnNames(firstRow.map((cell) => cell?.name));
  return undefined;
}

function toRecord(columns: string[], row: any[]): Record<string, any> {
  return Object.fromEntries(
    columns.map((column, index) => [column, cellValue(row[index]?.value)]),
  );
}

/**
 * Runs a query on a snapshot this function owns, so the snapshot can always
 * be ended. Settles exactly once: on the row past the cap, on end, on error,
 * on close, or on cancel. A destroyed Node stream emits only `close`, so the
 * result never depends on `end` or `error` arriving after a destroy.
 */
async function runQuery(
  database: any,
  statement: string,
  started: number,
  registerCancel?: (cancel: () => void) => void,
): Promise<QueryResponseType> {
  const [snapshot] = await database.getSnapshot();
  let stream: any;
  try {
    return await new Promise<QueryResponseType>((resolve, reject) => {
      const rows: any[] = [];
      let columns: string[] | undefined;
      let settled = false;
      const settle = (result: QueryResponseType | Error) => {
        if (settled) return;
        settled = true;
        if (result instanceof Error) reject(result);
        else resolve(result);
      };
      const succeed = (truncated: boolean) =>
        settle({
          success: true,
          data: rows,
          fields: (columns ?? []).map((name) => ({ name, type: 0 })),
          rowCount: rows.length,
          truncated,
          duration: Date.now() - started,
        });
      registerCancel?.(() =>
        settle({
          success: false,
          error: 'Query cancelled.',
          duration: Date.now() - started,
        }),
      );
      stream = snapshot.runStream({
        sql: statement,
        json: false,
        requestOptions: { requestTag: 'dbt-studio' },
        gaxOptions: { timeout: QUERY_TIMEOUT_MS },
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
      stream.on('error', (error: any) => settle(error));
      stream.on('close', () =>
        settle(
          new Error('The Spanner query stream closed before it finished.'),
        ),
      );
    });
  } finally {
    // Destroying the stream cancels the gRPC call if it is still running;
    // ending the snapshot releases its session.
    stream?.destroy();
    snapshot.end();
  }
}

function safeJson(value: unknown): string {
  const json = JSON.stringify(value, (_key, item) =>
    typeof item === 'bigint' ? item.toString() : item,
  );
  if (json.length <= SPANNER_MAX_JSON_CHARS) return json;
  return `${json.slice(0, SPANNER_MAX_JSON_CHARS)}… [truncated]`;
}

function errorText(error: any): string {
  const code = error?.code;
  if (code === 5 || code === 'NOT_FOUND')
    return 'Spanner instance or database was not found. Check the project, instance, and database IDs.';
  if (code === 7 || code === 'PERMISSION_DENIED')
    return 'Permission denied. The identity needs at least roles/spanner.databaseReader for queries.';
  if (code === 16 || code === 'UNAUTHENTICATED')
    return 'Spanner authentication failed. For ADC, run `gcloud auth application-default login`.';
  return String(error?.details || error?.message || 'Spanner request failed.');
}

export async function testSpannerConnection(
  connection: SpannerConnection,
): Promise<boolean> {
  try {
    const { database, release } = await acquireSpannerDatabase(connection);
    try {
      await database.run({ sql: 'SELECT 1 AS connection_test', json: true });
      return true;
    } finally {
      release();
    }
  } catch (error) {
    // Same readable text the query path shows (NOT_FOUND, PERMISSION_DENIED…).
    throw new Error(errorText(error));
  }
}

const DIALECT_DETECTION_TIMEOUT_MS = 10_000;

async function readSpannerDialect(database: any): Promise<SpannerDialect> {
  const dialectResult =
    typeof database.getDatabaseDialect === 'function'
      ? await Promise.resolve(database.getDatabaseDialect()).catch(
          () => undefined,
        )
      : undefined;
  const optionResult = dialectResult
    ? undefined
    : await database
        .run({
          sql: "SELECT option_value FROM information_schema.database_options WHERE option_name = 'database_dialect'",
          json: true,
        })
        .catch(() => [[], []]);
  const dialectText =
    `${dialectResult || ''} ${JSON.stringify(optionResult || '')}`.toUpperCase();
  return dialectText.includes('POSTGRESQL')
    ? 'POSTGRESQL'
    : 'GOOGLE_STANDARD_SQL';
}

async function detectSpannerDialect(
  connection: SpannerConnection,
): Promise<SpannerDialect | undefined> {
  const read = async () => {
    const { database, release } = await acquireSpannerDatabase(connection);
    try {
      return await readSpannerDialect(database);
    } finally {
      release();
    }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(resolve, DIALECT_DETECTION_TIMEOUT_MS, undefined);
  });
  try {
    return await Promise.race([read().catch(() => undefined), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Stores the detected dialect on a Spanner connection before it is saved;
 * other connection types are left as they are. Best-effort: if the database
 * can't be reached within the timeout, the previous value is kept and the
 * save goes ahead.
 */
export async function applySpannerDialect(
  connection: ConnectionInput,
): Promise<void> {
  if (connection.type !== 'spanner') return;
  // eslint-disable-next-line no-param-reassign
  connection.dialect =
    (await detectSpannerDialect(connection)) ?? connection.dialect;
}

export async function executeSpannerQuery(
  connection: SpannerConnection,
  sql: string,
  registerCancel?: (cancel: () => void) => void,
): Promise<QueryResponseType> {
  const started = Date.now();
  let lease: SpannerDatabaseLease | undefined;
  try {
    lease = await acquireSpannerDatabase(connection);
    const { database } = lease;
    const statements = splitStatements(sql);
    if (statements.length > 1) {
      if (!statements.every((statement) => classify(statement) === 'DDL')) {
        throw new Error(
          'Spanner runs one statement at a time. Select a single statement.',
        );
      }
      const result = await runDdl(
        connection,
        database,
        statements,
        registerCancel,
      );
      return { ...result, duration: Date.now() - started };
    }
    const statement = statements[0] || sql;
    const kind = classify(statement);
    if (kind === 'DDL') {
      const result = await runDdl(
        connection,
        database,
        [statement],
        registerCancel,
      );
      return { ...result, duration: Date.now() - started };
    }
    if (kind === 'DML' && !/\b(THEN\s+RETURN|RETURNING)\b/i.test(statement)) {
      let transaction: any;
      registerCancel?.(() => transaction?.rollback?.().catch(() => undefined));
      const [rowCount] = await runInTransaction(database, async (tx) => {
        transaction = tx;
        return tx.runUpdate({
          sql: statement,
          gaxOptions: { timeout: QUERY_TIMEOUT_MS },
        });
      });
      return {
        success: true,
        isCommand: true,
        commandType: 'DML',
        rowCount: Number(rowCount || 0),
        duration: Date.now() - started,
      };
    }
    if (kind === 'DML') {
      let transaction: any;
      registerCancel?.(() => transaction?.rollback?.().catch(() => undefined));
      const result = await runInTransaction(database, async (tx) => {
        transaction = tx;
        const [returned, , metadata] = await tx.run({
          sql: statement,
          json: false,
          gaxOptions: { timeout: QUERY_TIMEOUT_MS },
        });
        return { returned: (returned || []) as any[][], metadata };
      });
      const columns = columnsFrom(result.metadata, result.returned[0]) ?? [];
      const rows: any[] = result.returned
        .slice(0, SPANNER_MAX_ROWS)
        .map((row: any[]) => toRecord(columns, row));
      return {
        success: true,
        data: rows,
        fields: columns.map((name) => ({ name, type: 0 })),
        rowCount: rows.length,
        truncated: result.returned.length > SPANNER_MAX_ROWS,
        duration: Date.now() - started,
      };
    }
    return await runQuery(database, statement, started, registerCancel);
  } catch (error) {
    return {
      success: false,
      error: errorText(error),
      duration: Date.now() - started,
    };
  } finally {
    lease?.release();
  }
}

const ABORTED = 10;

/**
 * Runs DML in a read-write transaction and commits it. The SDK's runner
 * neither rolls back nor ends a transaction whose work fails, which leaves it
 * open on the server (the emulator then rejects schema changes while it is).
 * Roll it back here, except on ABORTED: Spanner has already ended that
 * transaction and the runner retries with a new one.
 */
async function runInTransaction<T>(
  database: any,
  work: (tx: any) => Promise<T>,
): Promise<T> {
  return database.runTransactionAsync(async (tx: any) => {
    let result: T;
    try {
      result = await work(tx);
    } catch (error: any) {
      if (error?.code !== ABORTED && error?.code !== 'ABORTED') {
        await tx.rollback().catch(() => undefined);
      }
      throw error;
    }
    await tx.commit();
    return result;
  });
}

async function runDdl(
  connection: SpannerConnection,
  database: any,
  statements: string[],
  registerCancel?: (cancel: () => void) => void,
): Promise<QueryResponseType> {
  const pending = ddlNeedsSchemaRefresh.get(connection.name);
  if (pending) {
    throw new Error(
      pending.status === 'running'
        ? `A previous Spanner schema change is still running${pending.operationId ? ` (${pending.operationId})` : ''}. Wait for it, then refresh the schema before retrying.`
        : `A previous Spanner schema change finished after its wait was cancelled${pending.operationId ? ` (${pending.operationId})` : ''}. Refresh the schema and verify the change before retrying.`,
    );
  }
  let cancelWait!: () => void;
  let cancelled = false;
  const cancellation = new Promise<'cancelled'>((resolve) => {
    cancelWait = () => {
      cancelled = true;
      resolve('cancelled');
    };
  });
  registerCancel?.(() => {
    cancelled = true;
    cancelWait();
  });
  ddlNeedsSchemaRefresh.set(connection.name, { status: 'running' });
  let operationId: string | undefined;
  let operation: Promise<'completed'>;
  try {
    const [longRunningOperation] = await database.updateSchema(statements);
    operationId = longRunningOperation?.name;
    ddlNeedsSchemaRefresh.set(connection.name, {
      status: 'running',
      operationId,
    });
    operation = Promise.resolve(longRunningOperation.promise()).then(
      () => {
        ddlNeedsSchemaRefresh.set(connection.name, {
          status: 'complete',
          operationId,
        });
        return 'completed' as const;
      },
      (error) => {
        // A batch can apply some statements before one fails, so a failed
        // change still needs a schema refresh once its wait was cancelled.
        // When the wait wasn't cancelled, the catch below clears the guard
        // and shows the error.
        ddlNeedsSchemaRefresh.set(connection.name, {
          status: 'complete',
          operationId,
        });
        throw error;
      },
    );
  } catch (error) {
    if (!cancelled) ddlNeedsSchemaRefresh.delete(connection.name);
    throw error;
  }
  let outcome: 'completed' | 'cancelled';
  try {
    outcome = await Promise.race([operation, cancellation]);
  } catch (error) {
    if (!cancelled) ddlNeedsSchemaRefresh.delete(connection.name);
    throw error;
  }
  if (outcome === 'cancelled' || cancelled) {
    return {
      success: false,
      isCommand: false,
      commandType: 'DDL',
      operationId,
      error: `Stopped waiting locally. The Spanner schema change may still complete${operationId ? ` (${operationId})` : ''}; refresh the schema and verify the result before retrying.`,
    };
  }
  ddlNeedsSchemaRefresh.delete(connection.name);
  return { success: true, isCommand: true, commandType: 'DDL' };
}

/**
 * Called after a successful schema refresh. Clears the DDL retry guard only
 * once the cancelled schema change has finished; while it is still running,
 * a refresh can't show its result yet, so retries stay blocked.
 */
export function confirmSpannerSchemaRefreshed(connectionName: string): void {
  if (ddlNeedsSchemaRefresh.get(connectionName)?.status === 'complete') {
    ddlNeedsSchemaRefresh.delete(connectionName);
  }
}

export const spannerQueryInternals = {
  splitStatements,
  classify,
  cellValue,
  uniqueColumnNames,
};
