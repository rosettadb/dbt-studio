import { open } from '../../../__setup__/ibmDb.mock';
import {
  DB2_MAX_TEXT_LENGTH,
  executeDb2Query,
  testDb2Connection,
  toDisplayValue,
  uniqueColumnNames,
} from '../../../../../src/main/services/db2/db2Query';
import { DB2_MAX_ROWS } from '../../../../../src/shared/db2';
import { Db2Connection } from '../../../../../src/types/backend';

const openMock = open as unknown as jest.Mock;

const connection: Db2Connection = {
  type: 'db2',
  name: 'db2-test',
  host: 'localhost',
  port: 50000,
  database: 'TESTDB',
  schema: '',
  username: 'db2inst1',
  password: 'Secret#123',
};

type FakeResultOptions = {
  columns?: string[];
  rows?: unknown[][];
  affected?: number;
};

const makeResult = ({
  columns = [],
  rows = [],
  affected = 0,
}: FakeResultOptions) => ({
  getColumnMetadataSync: jest.fn(() =>
    columns.map((name) => ({ SQL_DESC_NAME: name })),
  ),
  getAffectedRowsSync: jest.fn(() => affected),
  fetchN: jest.fn(async (count: number) => rows.slice(0, count)),
  closeSync: jest.fn(() => true),
});

/** What the Db2 CLI driver reports for a statement stopped by SQLCancel. */
const SQL_CANCEL_ERROR =
  '[IBM][CLI Driver][DB2/LINUXX8664] SQL0952N  Processing was cancelled due to an interrupt.  SQLSTATE=57014';

const makeDb = (
  options: {
    result?: ReturnType<typeof makeResult>;
    executeError?: Error;
    executeDelay?: Promise<void>;
    prepareDelay?: Promise<void>;
    /** `execute` keeps running until `db.cancel` interrupts it. */
    interruptible?: boolean;
    /** `db.cancel` returns only once this settles. */
    cancelDelay?: Promise<void>;
    name?: string;
    version?: string;
  } = {},
) => {
  let interrupt: (error: Error) => void = () => {};
  // No `cancel` here on purpose: `statement.cancel()` queues behind a running
  // `execute()` in ibm_db, so the code must not use it.
  const statement = {
    setAttr: jest.fn(async () => true),
    execute: jest.fn(async () => {
      if (options.interruptible) {
        await new Promise<void>((_resolve, reject) => {
          interrupt = reject;
        });
      }
      await options.executeDelay;
      if (options.executeError) throw options.executeError;
      return options.result ?? makeResult({});
    }),
    close: jest.fn(async () => false),
  };
  return {
    statement,
    prepare: jest.fn(async () => {
      await options.prepareDelay;
      return statement;
    }),
    // Like SQLCancel: the running execute fails, then the cancel returns.
    cancel: jest.fn(async (target: unknown) => {
      if (target === statement) interrupt(new Error(SQL_CANCEL_ERROR));
      await options.cancelDelay;
      return true;
    }),
    query: jest.fn(async () => [{ 1: 1 }]),
    getInfo: jest.fn(async (type: number) =>
      type === 17
        ? (options.name ?? 'DB2/LINUXX8664')
        : (options.version ?? '11.05.0900'),
    ),
    close: jest.fn(async () => true),
  };
};

const range = (count: number) =>
  Array.from({ length: count }, (_, index) => [index + 1, `row ${index + 1}`]);

const deferred = () => {
  let release: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, resolve: release };
};

/** Lets every pending mock call and promise callback run. */
const settle = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

const CANCELLED = { success: false, error: 'Query cancelled' };

beforeEach(() => {
  openMock.mockReset();
});

describe('executeDb2Query', () => {
  it('returns rows as objects keyed by column name', async () => {
    const db = makeDb({
      result: makeResult({ columns: ['ID', 'NAME'], rows: range(2) }),
    });
    openMock.mockResolvedValue(db);

    const response = await executeDb2Query(connection, 'SELECT * FROM T');

    expect(response).toEqual({
      success: true,
      data: [
        { ID: 1, NAME: 'row 1' },
        { ID: 2, NAME: 'row 2' },
      ],
      fields: [
        { name: 'ID', type: 0 },
        { name: 'NAME', type: 0 },
      ],
      rowCount: 2,
    });
    expect(db.statement.setAttr).toHaveBeenCalledWith(0, 600);
    expect(db.close).toHaveBeenCalled();
  });

  it('cuts the result at the row cap and marks it truncated', async () => {
    const result = makeResult({
      columns: ['ID', 'NAME'],
      rows: range(DB2_MAX_ROWS + 5),
    });
    openMock.mockResolvedValue(makeDb({ result }));

    const response = await executeDb2Query(connection, 'SELECT * FROM BIG');

    expect(result.fetchN).toHaveBeenCalledWith(DB2_MAX_ROWS + 1, {
      fetchMode: 3,
    });
    expect(response.data).toHaveLength(DB2_MAX_ROWS);
    expect(response.rowCount).toBe(DB2_MAX_ROWS);
    expect(response.truncated).toBe(true);
  });

  it('does not mark a result of exactly the cap as truncated', async () => {
    openMock.mockResolvedValue(
      makeDb({
        result: makeResult({
          columns: ['ID', 'NAME'],
          rows: range(DB2_MAX_ROWS),
        }),
      }),
    );

    const response = await executeDb2Query(connection, 'SELECT * FROM T');

    expect(response.data).toHaveLength(DB2_MAX_ROWS);
    expect(response.truncated).toBeUndefined();
  });

  it('reports DML and DDL as commands', async () => {
    openMock.mockResolvedValueOnce(
      makeDb({ result: makeResult({ affected: 3 }) }),
    );
    await expect(
      executeDb2Query(connection, ' insert into T values (1)'),
    ).resolves.toMatchObject({
      isCommand: true,
      commandType: 'DML',
      rowCount: 3,
    });

    openMock.mockResolvedValueOnce(
      makeDb({ result: makeResult({ affected: -1 }) }),
    );
    await expect(
      executeDb2Query(connection, 'CREATE TABLE T (A INT)'),
    ).resolves.toMatchObject({
      isCommand: true,
      commandType: 'DDL',
      rowCount: 0,
    });
  });

  it('closes the connection and scrubs the password when the statement fails', async () => {
    const db = makeDb({
      executeError: new Error('SQL0204N failed PWD=Secret#123; Secret#123\n'),
    });
    openMock.mockResolvedValue(db);

    const response = await executeDb2Query(connection, 'SELECT * FROM NOPE');

    expect(response.success).toBe(false);
    expect(response.error).toBe('SQL0204N failed PWD=***; ***');
    expect(db.statement.close).toHaveBeenCalled();
    expect(db.close).toHaveBeenCalled();
  });

  it('explains a server-side timeout', async () => {
    openMock.mockResolvedValue(
      makeDb({
        executeError: new Error(
          'SQL0952N Processing was cancelled due to an interrupt.',
        ),
      }),
    );

    const response = await executeDb2Query(connection, 'SELECT * FROM SLOW');

    expect(response.error).toMatch(
      /^Query stopped after the 10-minute Db2 time limit/,
    );
  });

  it('runs at most two statements at once and cancels a queued one without connecting', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    openMock.mockImplementation(async () =>
      makeDb({
        executeDelay: gate,
        result: makeResult({ columns: ['C'], rows: [[1]] }),
      }),
    );

    const first = executeDb2Query(connection, 'SELECT 1 FROM A');
    const second = executeDb2Query(connection, 'SELECT 1 FROM B');
    let cancelThird: () => void = () => {};
    const third = executeDb2Query(connection, 'SELECT 1 FROM C', (cancel) => {
      cancelThird = cancel;
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(openMock).toHaveBeenCalledTimes(2);

    cancelThird();
    await expect(third).resolves.toEqual({
      success: false,
      error: 'Query cancelled',
    });

    release();
    await expect(first).resolves.toMatchObject({ success: true });
    await expect(second).resolves.toMatchObject({ success: true });
    expect(openMock).toHaveBeenCalledTimes(2);
  });

  it('answers a cancel of a running statement at once', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    openMock.mockResolvedValue(makeDb({ executeDelay: gate }));

    let cancel: () => void = () => {};
    const running = executeDb2Query(connection, 'SELECT * FROM SLOW', (fn) => {
      cancel = fn;
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    cancel();

    await expect(running).resolves.toEqual({
      success: false,
      error: 'Query cancelled',
    });
    release();
  });
});

describe('executeDb2Query cancel of a running statement', () => {
  const slowQuery = (index: number, cancels: Array<() => void>) =>
    executeDb2Query(connection, `SELECT * FROM SLOW_${index}`, (cancel) => {
      cancels.push(cancel);
    });

  const quickDb = () =>
    makeDb({ result: makeResult({ columns: ['C'], rows: [[1]] }) });

  it('interrupts the statement with db.cancel, then closes it', async () => {
    const db = makeDb({ interruptible: true });
    openMock.mockResolvedValue(db);

    const cancels: Array<() => void> = [];
    const running = slowQuery(0, cancels);
    await settle();
    expect(db.statement.execute).toHaveBeenCalled();

    cancels[0]();
    cancels[0]();
    await expect(running).resolves.toEqual(CANCELLED);
    await settle();

    expect(db.cancel).toHaveBeenCalledTimes(1);
    expect(db.cancel).toHaveBeenCalledWith(db.statement);
    expect(db.statement.close).toHaveBeenCalledTimes(1);
    expect(db.close).toHaveBeenCalledTimes(1);
    expect(db.cancel.mock.invocationCallOrder[0]).toBeLessThan(
      db.statement.close.mock.invocationCallOrder[0],
    );
    expect(db.statement.close.mock.invocationCallOrder[0]).toBeLessThan(
      db.close.mock.invocationCallOrder[0],
    );
  });

  it('starts queued queries and connection tests once cancelled statements stop', async () => {
    const slow = [
      makeDb({ interruptible: true }),
      makeDb({ interruptible: true }),
    ];
    openMock
      .mockResolvedValueOnce(slow[0])
      .mockResolvedValueOnce(slow[1])
      .mockImplementation(async () => quickDb());

    const cancels: Array<() => void> = [];
    const running = [slowQuery(0, cancels), slowQuery(1, cancels)];
    const queuedQuery = executeDb2Query(connection, 'SELECT C FROM QUEUED');
    const queuedTest = testDb2Connection(connection);
    await settle();
    expect(openMock).toHaveBeenCalledTimes(2);

    cancels.forEach((cancel) => cancel());
    await expect(Promise.all(running)).resolves.toEqual([CANCELLED, CANCELLED]);
    await expect(queuedQuery).resolves.toMatchObject({
      success: true,
      data: [{ C: 1 }],
    });
    await expect(queuedTest).resolves.toBe(true);
    expect(openMock).toHaveBeenCalledTimes(4);
    slow.forEach((db) => {
      expect(db.cancel).toHaveBeenCalledWith(db.statement);
      expect(db.close).toHaveBeenCalled();
    });
    await settle();
  });

  it('keeps the Db2 slot until SQLCancel returns', async () => {
    const cancelReturned = deferred();
    const slow = [
      makeDb({ interruptible: true, cancelDelay: cancelReturned.promise }),
      makeDb({ interruptible: true, cancelDelay: cancelReturned.promise }),
    ];
    openMock
      .mockResolvedValueOnce(slow[0])
      .mockResolvedValueOnce(slow[1])
      .mockImplementation(async () => quickDb());

    const cancels: Array<() => void> = [];
    const running = [slowQuery(0, cancels), slowQuery(1, cancels)];
    const queued = executeDb2Query(connection, 'SELECT C FROM QUEUED');
    await settle();

    cancels.forEach((cancel) => cancel());
    await expect(Promise.all(running)).resolves.toEqual([CANCELLED, CANCELLED]);
    await settle();
    slow.forEach((db) => {
      expect(db.cancel).toHaveBeenCalled();
      expect(db.statement.close).not.toHaveBeenCalled();
      expect(db.close).not.toHaveBeenCalled();
    });
    expect(openMock).toHaveBeenCalledTimes(2);

    cancelReturned.resolve();
    await expect(queued).resolves.toMatchObject({ success: true });
    expect(openMock).toHaveBeenCalledTimes(3);
    slow.forEach((db) => expect(db.statement.close).toHaveBeenCalled());
    await settle();
  });

  it('skips execute when cancelled while the statement is prepared', async () => {
    const prepared = deferred();
    const db = makeDb({ prepareDelay: prepared.promise });
    openMock.mockResolvedValue(db);

    const cancels: Array<() => void> = [];
    const running = slowQuery(0, cancels);
    await settle();
    expect(db.prepare).toHaveBeenCalled();

    cancels[0]();
    await expect(running).resolves.toEqual(CANCELLED);
    prepared.resolve();
    await settle();

    expect(db.statement.execute).not.toHaveBeenCalled();
    expect(db.cancel).not.toHaveBeenCalled();
    expect(db.statement.close).toHaveBeenCalled();
    expect(db.close).toHaveBeenCalled();
  });

  it('skips prepare when cancelled while connecting', async () => {
    const opened = deferred();
    const db = makeDb();
    openMock.mockImplementation(async () => {
      await opened.promise;
      return db;
    });

    const cancels: Array<() => void> = [];
    const running = slowQuery(0, cancels);
    await settle();
    cancels[0]();
    await expect(running).resolves.toEqual(CANCELLED);
    opened.resolve();
    await settle();

    expect(db.prepare).not.toHaveBeenCalled();
    expect(db.close).toHaveBeenCalled();
  });
});

describe('testDb2Connection', () => {
  it('passes for Db2 LUW 11.1 or later', async () => {
    openMock.mockResolvedValue(makeDb({ version: '12.01.0500' }));
    await expect(testDb2Connection(connection)).resolves.toBe(true);
  });

  it('rejects servers older than 11.1', async () => {
    openMock.mockResolvedValue(makeDb({ version: '10.05.0011' }));
    await expect(testDb2Connection(connection)).rejects.toThrow(
      'Db2 11.1 or later is required (server reports 10.05.0011).',
    );
  });

  it('rejects Db2 for z/OS and IBM i', async () => {
    openMock.mockResolvedValue(makeDb({ name: 'DSN12015' }));
    await expect(testDb2Connection(connection)).rejects.toThrow(
      /Only Db2 for Linux, UNIX and Windows is supported/,
    );
  });

  it('throws the scrubbed driver message when the login fails', async () => {
    openMock.mockRejectedValue(
      new Error('SQL30082N Security processing failed PWD=Secret#123'),
    );
    await expect(testDb2Connection(connection)).rejects.toThrow(
      'SQL30082N Security processing failed PWD=***',
    );
  });

  it('checks the CA certificate file before connecting', async () => {
    await expect(
      testDb2Connection({
        ...connection,
        ssl: true,
        sslCaPath: '/definitely/missing/ca.arm',
      }),
    ).rejects.toThrow('Certificate file not found: /definitely/missing/ca.arm');
    expect(openMock).not.toHaveBeenCalled();
  });
});

describe('value helpers', () => {
  it('replaces BLOBs and cuts long text', () => {
    expect(toDisplayValue(Buffer.from([1, 2, 3]))).toBe('<BLOB 3 bytes>');
    const long = 'x'.repeat(DB2_MAX_TEXT_LENGTH + 10);
    expect(toDisplayValue(long)).toBe(
      `${'x'.repeat(DB2_MAX_TEXT_LENGTH)}… [truncated, ${long.length} characters]`,
    );
    expect(toDisplayValue('9223372036854775807')).toBe('9223372036854775807');
    expect(toDisplayValue(null)).toBeNull();
  });

  it('keeps repeated column names distinct', () => {
    expect(uniqueColumnNames(['ID', 'ID', 'NAME', 'ID'])).toEqual([
      'ID',
      'ID_2',
      'NAME',
      'ID_3',
    ]);
  });
});
