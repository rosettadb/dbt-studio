import fs from 'fs';
import type { Database, ODBCResult } from 'ibm_db';
import { Db2Connection, QueryResponseType } from '../../../types/backend';
import {
  DB2_MAX_ROWS,
  DB2_MIN_SERVER_VERSION,
  isSupportedDb2Version,
  parseDb2Version,
} from '../../../shared/db2';
import { getIbmDb } from './db2Driver';
import {
  buildDb2ConnectionString,
  scrubDb2Secrets,
} from './db2ConnectionString';

/**
 * `ibm_db` runs its async calls on libuv's worker pool (4 threads by default),
 * which `fs`, `crypto`, `zlib` and DNS share. Capping Db2 work keeps two of
 * those threads free for the rest of the main process.
 */
export const DB2_MAX_CONCURRENT_OPERATIONS = 2;

/** Server-side limit for one statement (`SQL_ATTR_QUERY_TIMEOUT`). */
export const DB2_QUERY_TIMEOUT_SECONDS = 600;

/** CLOB, DBCLOB and XML values longer than this are cut for the UI. */
export const DB2_MAX_TEXT_LENGTH = 64 * 1024;

const SQL_ATTR_QUERY_TIMEOUT = 0;
const SQL_DBMS_NAME = 17;
const SQL_DBMS_VER = 18;
const FETCH_ARRAY = 3;

const CANCELLED_MESSAGE = 'Query cancelled';

export class Db2CancelledError extends Error {
  constructor() {
    super(CANCELLED_MESSAGE);
    this.name = 'Db2CancelledError';
  }
}

// ---------------------------------------------------------------------------
// Concurrency slots
// ---------------------------------------------------------------------------

type Waiter = { start: () => void };

let slotsInUse = 0;
const waiting: Waiter[] = [];

const releaseSlot = () => {
  const next = waiting.shift();
  if (next) {
    next.start();
    return;
  }
  slotsInUse -= 1;
};

/**
 * Runs `task` when one of the Db2 slots is free. While the task is queued,
 * the function passed to `onQueued` removes it without opening a connection.
 */
export const runInDb2Slot = <T>(
  task: () => Promise<T>,
  onQueued?: (abandon: () => void) => void,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const start = () => {
      // resolve/reject settle the caller; finally only frees the slot.
      // eslint-disable-next-line promise/catch-or-return
      task().then(resolve, reject).finally(releaseSlot);
    };

    if (slotsInUse < DB2_MAX_CONCURRENT_OPERATIONS) {
      slotsInUse += 1;
      start();
      return;
    }

    const waiter: Waiter = { start };
    waiting.push(waiter);
    onQueued?.(() => {
      const index = waiting.indexOf(waiter);
      if (index !== -1) {
        waiting.splice(index, 1);
        reject(new Db2CancelledError());
      }
    });
  });

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message.trim();
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message).trim();
  }
  return String(error).trim();
};

const toDb2Error = (error: unknown, password?: string): Error => {
  if (error instanceof Db2CancelledError) return error;
  const message = scrubDb2Secrets(errorMessage(error), password);
  // SQL0952N is what the server raises when SQL_ATTR_QUERY_TIMEOUT fires.
  if (message.includes('SQL0952N')) {
    return new Error(
      `Query stopped after the ${DB2_QUERY_TIMEOUT_SECONDS / 60}-minute Db2 time limit. ${message}`,
    );
  }
  return new Error(message);
};

const assertCaFile = async (connection: Db2Connection) => {
  const caPath = connection.ssl ? connection.sslCaPath?.trim() : undefined;
  if (!caPath) return;
  const stat = await fs.promises.stat(caPath).catch(() => null);
  if (!stat?.isFile()) {
    throw new Error(`Certificate file not found: ${caPath}`);
  }
};

/**
 * Opens a connection, runs `fn`, and always closes the connection. Errors
 * come back with the password removed.
 */
export const withDb2Connection = async <T>(
  connection: Db2Connection,
  fn: (db: Database) => Promise<T>,
): Promise<T> => {
  let db: Database | undefined;
  try {
    const connectionString = buildDb2ConnectionString(connection);
    await assertCaFile(connection);
    const ibmdb = await getIbmDb();
    db = await ibmdb.open(connectionString);
    return await fn(db);
  } catch (error) {
    throw toDb2Error(error, connection.password);
  } finally {
    if (db) {
      await db.close().catch(() => undefined);
    }
  }
};

// ---------------------------------------------------------------------------
// Server check
// ---------------------------------------------------------------------------

/**
 * Rejects servers that aren't Db2 LUW 11.1+. If the driver can't report the
 * version, the check passes and a note is logged.
 */
export const assertSupportedDb2Server = async (db: Database): Promise<void> => {
  let name: string | number | null;
  let version: string | number | null;
  try {
    name = await db.getInfo(SQL_DBMS_NAME, 64);
    version = await db.getInfo(SQL_DBMS_VER, 32);
  } catch {
    // eslint-disable-next-line no-console
    console.warn('db2: server version unavailable');
    return;
  }

  if (name && !String(name).toUpperCase().startsWith('DB2/')) {
    throw new Error(
      `Only Db2 for Linux, UNIX and Windows is supported (server reports ${name}).`,
    );
  }

  const parsed = parseDb2Version(version);
  if (!parsed) {
    // eslint-disable-next-line no-console
    console.warn('db2: server version unavailable');
    return;
  }
  if (!isSupportedDb2Version(parsed)) {
    throw new Error(
      `Db2 ${DB2_MIN_SERVER_VERSION.major}.${DB2_MIN_SERVER_VERSION.minor} or later is required (server reports ${version}).`,
    );
  }
};

/**
 * Tests a Db2 connection. Throws with the Db2 message on failure, because
 * `connector:test` only returns a boolean and the form shows thrown errors.
 */
export const testDb2Connection = async (
  connection: Db2Connection,
): Promise<boolean> =>
  runInDb2Slot(() =>
    withDb2Connection(connection, async (db) => {
      await db.query('SELECT 1 FROM SYSIBM.SYSDUMMY1');
      await assertSupportedDb2Server(db);
      return true;
    }),
  );

// ---------------------------------------------------------------------------
// Query execution
// ---------------------------------------------------------------------------

/** Makes a driver value safe to send over IPC and to keep in query history. */
export const toDisplayValue = (value: unknown): unknown => {
  if (Buffer.isBuffer(value)) {
    return `<BLOB ${value.length} bytes>`;
  }
  if (typeof value === 'string' && value.length > DB2_MAX_TEXT_LENGTH) {
    return `${value.slice(0, DB2_MAX_TEXT_LENGTH)}… [truncated, ${value.length} characters]`;
  }
  return value;
};

/** Result columns can repeat (`SELECT a.ID, b.ID`); keep every one. */
export const uniqueColumnNames = (names: string[]): string[] => {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return count === 0 ? name : `${name}_${count + 1}`;
  });
};

const commandResponse = (sql: string, affected: number): QueryResponseType => {
  const keyword = sql.trimStart().split(/\s+/, 1)[0]?.toUpperCase() ?? '';
  return {
    success: true,
    data: [],
    fields: [],
    rowCount: Math.max(affected, 0),
    isCommand: true,
    commandType: ['INSERT', 'UPDATE', 'DELETE', 'MERGE'].includes(keyword)
      ? 'DML'
      : 'DDL',
  };
};

const readRows = async (
  result: ODBCResult,
  sql: string,
  isCancelled: () => boolean,
): Promise<QueryResponseType> => {
  const columns = result.getColumnMetadataSync() ?? [];
  if (columns.length === 0) {
    return commandResponse(sql, result.getAffectedRowsSync());
  }
  if (isCancelled()) throw new Db2CancelledError();

  const names = uniqueColumnNames(
    columns.map((column) => String(column.SQL_DESC_NAME)),
  );
  const fetchRows = result.fetchN as unknown as (
    count: number,
    options: { fetchMode: number },
  ) => Promise<unknown[][]>;
  const fetched = await fetchRows.call(result, DB2_MAX_ROWS + 1, {
    fetchMode: FETCH_ARRAY,
  });
  const truncated = fetched.length > DB2_MAX_ROWS;
  const rows = truncated ? fetched.slice(0, DB2_MAX_ROWS) : fetched;

  const data = rows.map((row) => {
    const record: Record<string, unknown> = {};
    names.forEach((name, index) => {
      record[name] = toDisplayValue(row[index]);
    });
    return record;
  });

  return {
    success: true,
    data: data as unknown as QueryResponseType['data'],
    fields: names.map((name) => ({ name, type: 0 })),
    rowCount: data.length,
    ...(truncated ? { truncated: true } : {}),
  };
};

const runStatement = async (
  db: Database,
  sql: string,
  isCancelled: () => boolean,
): Promise<QueryResponseType> => {
  const statement = await db.prepare(sql);
  try {
    await statement.setAttr(SQL_ATTR_QUERY_TIMEOUT, DB2_QUERY_TIMEOUT_SECONDS);
    const executed = await statement.execute();
    const result = Array.isArray(executed) ? executed[0] : executed;
    if (!result) return commandResponse(sql, 0);
    try {
      return await readRows(result, sql, isCancelled);
    } finally {
      result.closeSync();
    }
  } finally {
    await statement.close().catch(() => undefined);
  }
};

/**
 * Runs one statement for the SQL Editor or a Notebook.
 *
 * `ibm_db` has no statement cancel, so cancelling answers the UI at once and
 * stops reading rows; a statement already running on the server ends when it
 * finishes or reaches `DB2_QUERY_TIMEOUT_SECONDS`. A queued statement is
 * dropped without connecting.
 */
export const executeDb2Query = (
  connection: Db2Connection,
  sql: string,
  registerCancel?: (cancel: () => void) => void,
): Promise<QueryResponseType> => {
  let cancelled = false;
  let abandonQueued: (() => void) | undefined;
  let answerCancelled: (response: QueryResponseType) => void = () => {};
  const cancelledResponse = new Promise<QueryResponseType>((resolve) => {
    answerCancelled = resolve;
  });

  registerCancel?.(() => {
    cancelled = true;
    abandonQueued?.();
    answerCancelled({ success: false, error: CANCELLED_MESSAGE });
  });

  const work = runInDb2Slot(
    () =>
      withDb2Connection(connection, (db) =>
        runStatement(db, sql, () => cancelled),
      ),
    (abandon) => {
      abandonQueued = abandon;
    },
  ).catch(
    (error: unknown): QueryResponseType => ({
      success: false,
      error:
        cancelled || error instanceof Db2CancelledError
          ? CANCELLED_MESSAGE
          : errorMessage(error) ||
            'Unknown error occurred during query execution',
    }),
  );

  return Promise.race([work, cancelledResponse]);
};
