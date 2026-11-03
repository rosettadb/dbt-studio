process.env.TZ = 'Asia/Tokyo'; // east of UTC: toISOString() would move a DATE back a day

/* eslint-disable import/first */
import { PassThrough } from 'stream';
import { PreciseDate } from '@google-cloud/precise-date';
import {
  Float,
  Int,
  Numeric,
  PGNumeric,
  SpannerDate,
} from '@google-cloud/spanner/build/src/codec';
import {
  database,
  resetSpannerMock,
} from '../../__setup__/googleCloudSpanner.mock';
import type { SpannerConnection } from '../../../../src/connections/spanner/spanner.shared';

jest.mock('../../../../src/main/services/secureStorage.service', () => ({
  __esModule: true,
  default: { getCredential: jest.fn() },
}));

import { closeSpannerClients } from '../../../../src/connections/spanner/spanner.client.main';
import {
  classify,
  executeSpannerQuery,
  splitStatements,
  testSpannerConnection,
  uniqueColumnNames,
} from '../../../../src/connections/spanner/spanner.query.main';

const conn: SpannerConnection = {
  type: 'spanner',
  name: 'query-test',
  username: 'my-project',
  password: '',
  project: 'my-project',
  instance: 'my-instance',
  database: 'my-db',
  schema: '',
  authMethod: 'adc',
};

/** Lets the code under test reach its next await. */
const tick = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

const cell = (name: string, value: unknown) => ({ name, value });
const metadata = (...names: string[]) => ({
  rowType: { fields: names.map((name) => ({ name })) },
});

/** A snapshot whose stream is a real object-mode stream, like the SDK's. */
function useSnapshot() {
  const stream = new PassThrough({ objectMode: true });
  const snapshot = { runStream: jest.fn(() => stream), end: jest.fn() };
  database.getSnapshot.mockResolvedValue([snapshot]);
  return { stream, snapshot };
}

const pushRows = (stream: PassThrough, count: number) => {
  for (let i = 0; i < count; i += 1)
    stream.write([cell('id', new Int(String(i)))]);
  stream.end();
};

describe('spanner statements', () => {
  it('classifies after any number of leading comments and hints', () => {
    expect(classify('SELECT 1')).toBe('QUERY');
    expect(classify('WITH a AS (SELECT 1) SELECT * FROM a')).toBe('QUERY');
    expect(classify('-- a\n-- b\nINSERT INTO t VALUES (1)')).toBe('DML');
    expect(classify('-- a\n/* b */ UPDATE t SET a = 1')).toBe('DML');
    expect(classify('@{FORCE_INDEX=idx} DELETE FROM t WHERE true')).toBe('DML');
    expect(
      classify('/* x */ -- y\n CREATE TABLE t (id INT64) PRIMARY KEY (id)'),
    ).toBe('DDL');
    ['ALTER', 'DROP', 'GRANT', 'REVOKE', 'RENAME', 'ANALYZE'].forEach((word) =>
      expect(classify(`${word} x`)).toBe('DDL'),
    );
  });

  it('splits on semicolons outside quotes and comments', () => {
    expect(
      splitStatements("SELECT 'a;b'; SELECT 2 -- c;d\n; /* ; */ SELECT 3"),
    ).toEqual(["SELECT 'a;b'", 'SELECT 2 -- c;d', '/* ; */ SELECT 3']);
  });

  it('GoogleSQL: keeps backslash escapes and # comments in one statement', () => {
    expect(splitStatements("SELECT 'it\\'s; ok', `a\\`;b`")).toEqual([
      "SELECT 'it\\'s; ok', `a\\`;b`",
    ]);
    expect(splitStatements('# a;b\nSELECT 1; SELECT 2')).toEqual([
      '# a;b\nSELECT 1',
      'SELECT 2',
    ]);
  });

  it('PostgreSQL dialect: a backslash is literal and # is no comment', () => {
    expect(splitStatements("SELECT 'C:\\'; SELECT 2", 'POSTGRESQL')).toEqual([
      "SELECT 'C:\\'",
      'SELECT 2',
    ]);
    expect(splitStatements('SELECT 1 # 2; SELECT 3', 'POSTGRESQL')).toEqual([
      'SELECT 1 # 2',
      'SELECT 3',
    ]);
  });

  it('names unnamed and repeated columns', () => {
    expect(uniqueColumnNames(['id', 'id', '', undefined, 'id'])).toEqual([
      'id',
      'id_2',
      '_2',
      '_3',
      'id_3',
    ]);
    expect(uniqueColumnNames(['a', ''])).toEqual(['a', '_1']);
  });
});

describe('spanner queries', () => {
  beforeEach(() => resetSpannerMock());
  afterEach(() => closeSpannerClients());

  it('returns rows and fields from the result metadata', async () => {
    const { stream, snapshot } = useSnapshot();
    const run = executeSpannerQuery(conn, 'SELECT id, name FROM t');
    await tick();
    stream.emit('response', { metadata: metadata('id', 'name') });
    stream.write([cell('id', new Int('1')), cell('name', 'a')]);
    stream.end();
    const result = await run;
    expect(result).toMatchObject({
      success: true,
      data: [{ id: '1', name: 'a' }],
      fields: [
        { name: 'id', type: 0 },
        { name: 'name', type: 0 },
      ],
      rowCount: 1,
    });
    expect(snapshot.runStream).toHaveBeenCalledWith(
      expect.objectContaining({ sql: 'SELECT id, name FROM t', json: false }),
    );
    expect(snapshot.end).toHaveBeenCalledTimes(1);
  });

  it('keeps an unnamed COUNT(*) and both duplicate id columns', async () => {
    const { stream } = useSnapshot();
    const run = executeSpannerQuery(
      conn,
      'SELECT COUNT(*), a.id, b.id FROM a, b',
    );
    await tick();
    stream.emit('response', { metadata: metadata('', 'id', 'id') });
    stream.write([
      cell('', new Int('42')),
      cell('id', new Int('1')),
      cell('id', new Int('2')),
    ]);
    stream.end();
    expect((await run).data).toEqual([{ _0: '42', id: '1', id_2: '2' }]);
  });

  it('shows column headers for a result with no rows', async () => {
    const { stream } = useSnapshot();
    const run = executeSpannerQuery(conn, 'SELECT id FROM t WHERE false');
    await tick();
    stream.emit('response', { metadata: metadata('id') });
    stream.end();
    expect(await run).toMatchObject({
      success: true,
      data: [],
      fields: [{ name: 'id', type: 0 }],
    });
  });

  it('caps at 10,000 rows when there are more, and ends the snapshot', async () => {
    const { stream, snapshot } = useSnapshot();
    const run = executeSpannerQuery(conn, 'SELECT id FROM t');
    await tick();
    pushRows(stream, 10_001);
    const result = await run;
    expect(result.data).toHaveLength(10_000);
    expect(result.rowCount).toBe(10_000);
    expect(snapshot.end).toHaveBeenCalledTimes(1);
  });

  it('returns every row of a result of exactly 10,000 rows', async () => {
    const { stream } = useSnapshot();
    const run = executeSpannerQuery(conn, 'SELECT id FROM t');
    await tick();
    pushRows(stream, 10_000);
    expect((await run).data).toHaveLength(10_000);
  });

  it('settles on Stop before any data, and ends the snapshot', async () => {
    const { stream, snapshot } = useSnapshot();
    let stop!: () => void;
    const run = executeSpannerQuery(conn, 'SELECT id FROM t', (cancel) => {
      stop = cancel;
    });
    await tick();
    stop();
    expect(await run).toEqual({ success: false, error: 'Query cancelled.' });
    expect(stream.destroyed).toBe(true);
    expect(snapshot.end).toHaveBeenCalledTimes(1);
  });

  it('settles on Stop in the middle of a stream', async () => {
    const { stream, snapshot } = useSnapshot();
    let stop!: () => void;
    const run = executeSpannerQuery(conn, 'SELECT id FROM t', (cancel) => {
      stop = cancel;
    });
    await tick();
    stream.write([cell('id', new Int('1'))]);
    await tick();
    stop();
    expect(await run).toEqual({ success: false, error: 'Query cancelled.' });
    expect(snapshot.end).toHaveBeenCalledTimes(1);
  });

  it('splits with the database dialect', async () => {
    const { stream, snapshot } = useSnapshot();
    const run = executeSpannerQuery(conn, "SELECT 'it\\'s; ok'");
    await tick();
    stream.end();
    expect((await run).success).toBe(true);
    expect(snapshot.runStream).toHaveBeenCalledWith(
      expect.objectContaining({ sql: "SELECT 'it\\'s; ok'" }),
    );

    closeSpannerClients();
    database.getDatabaseDialect.mockResolvedValue('POSTGRESQL');
    expect(
      await executeSpannerQuery(conn, "SELECT 'C:\\'; SELECT 2"),
    ).toMatchObject({ success: false, error: expect.stringContaining('one') });
  });

  it('runs nothing on a session retry after Stop', async () => {
    let stop!: () => void;
    database.getSnapshot.mockImplementationOnce(async () => {
      stop();
      throw Object.assign(new Error('gone'), {
        code: 5,
        details: 'Session not found: s/0',
      });
    });
    const result = await executeSpannerQuery(conn, 'SELECT 1', (cancel) => {
      stop = cancel;
    });
    expect(result).toEqual({ success: false, error: 'Query cancelled.' });
    expect(database.getSnapshot).toHaveBeenCalledTimes(1);
  });

  it('reports a stream error as readable text', async () => {
    const { stream, snapshot } = useSnapshot();
    const run = executeSpannerQuery(conn, 'SELECT id FROM nope');
    await tick();
    stream.emit('error', { code: 5, details: 'Table not found' });
    expect(await run).toMatchObject({
      success: false,
      error: expect.stringContaining('was not found'),
    });
    expect(snapshot.end).toHaveBeenCalledTimes(1);
  });

  it('maps every value type to something IPC-safe', async () => {
    const { stream } = useSnapshot();
    const run = executeSpannerQuery(conn, 'SELECT * FROM t');
    await tick();
    stream.emit('response', {
      metadata: metadata(
        'i',
        'f',
        'n',
        'pn',
        'd',
        'ts',
        'b',
        'arr',
        'nan',
        'nul',
      ),
    });
    stream.write([
      cell('i', new Int('9007199254740993')),
      cell('f', new Float(1.5)),
      cell('n', new Numeric('1.10')),
      cell('pn', new PGNumeric('2.50')),
      cell('d', new SpannerDate('2024-01-02')),
      cell('ts', new PreciseDate('2024-01-02T03:04:05.123456789Z')),
      cell('b', Buffer.from('abc')),
      cell('arr', [new Int('1'), new Int('2')]),
      cell('nan', Number.NaN),
      cell('nul', null),
    ]);
    stream.end();
    const [row] = (await run).data as unknown as Record<string, unknown>[];
    expect(row).toEqual({
      i: '9007199254740993',
      f: 1.5,
      n: '1.10',
      pn: '2.50',
      d: '2024-01-02',
      ts: '2024-01-02T03:04:05.123456789Z',
      b: '<BYTES 3 bytes>',
      arr: '["1","2"]',
      nan: 'NaN',
      nul: null,
    });
  });

  it('rejects several statements unless all are DDL', async () => {
    const result = await executeSpannerQuery(conn, 'SELECT 1; SELECT 2');
    expect(result).toEqual({
      success: false,
      error: 'Spanner runs one statement at a time. Select a single statement.',
    });
    expect(database.getSnapshot).not.toHaveBeenCalled();
  });
});

describe('spanner DML', () => {
  const tx = {
    runUpdate: jest.fn(),
    run: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
  };

  beforeEach(() => {
    resetSpannerMock();
    Object.values(tx).forEach((fn) => fn.mockReset());
    tx.commit.mockResolvedValue(undefined);
    tx.rollback.mockResolvedValue(undefined);
    database.runTransactionAsync.mockImplementation((work) => work(tx));
  });
  afterEach(() => closeSpannerClients());

  it('runs plain DML with one request object and commits', async () => {
    tx.runUpdate.mockResolvedValue([3]);
    const result = await executeSpannerQuery(
      conn,
      'UPDATE t SET a = 1 WHERE true',
    );
    expect(result).toEqual({
      success: true,
      isCommand: true,
      commandType: 'DML',
      rowCount: 3,
    });
    expect(tx.runUpdate).toHaveBeenCalledTimes(1);
    const args = tx.runUpdate.mock.calls[0] as unknown[];
    expect(args).toHaveLength(1);
    expect(args[0]).toMatchObject({
      sql: 'UPDATE t SET a = 1 WHERE true',
      gaxOptions: { timeout: 600_000 },
    });
    expect(tx.commit).toHaveBeenCalledTimes(1);
  });

  it('returns the rows of THEN RETURN as a result set, not a command', async () => {
    tx.run.mockResolvedValue([
      [[cell('id', new Int('7'))]],
      {},
      metadata('id'),
    ]);
    const result = await executeSpannerQuery(
      conn,
      "INSERT INTO t (id) VALUES (7) THEN RETURN id -- 'x'",
    );
    expect(result).toMatchObject({
      success: true,
      isCommand: false,
      data: [{ id: '7' }],
      fields: [{ name: 'id', type: 0 }],
      rowCount: 1,
    });
    expect(tx.runUpdate).not.toHaveBeenCalled();
  });

  it('does not treat THEN RETURN inside a string or comment as returning', async () => {
    tx.runUpdate.mockResolvedValue([1]);
    await executeSpannerQuery(
      conn,
      "INSERT INTO t (s) VALUES ('THEN RETURN') -- RETURNING",
    );
    expect(tx.runUpdate).toHaveBeenCalledTimes(1);
    expect(tx.run).not.toHaveBeenCalled();
  });

  it('rolls back a failed statement', async () => {
    tx.runUpdate.mockRejectedValue({ code: 3, details: 'bad value' });
    const result = await executeSpannerQuery(conn, 'DELETE FROM t WHERE true');
    expect(result).toEqual({ success: false, error: 'bad value' });
    expect(tx.rollback).toHaveBeenCalledTimes(1);
    expect(tx.commit).not.toHaveBeenCalled();
  });

  it('leaves ABORTED to the SDK retry instead of rolling back', async () => {
    tx.runUpdate.mockRejectedValue({ code: 10, details: 'aborted' });
    await executeSpannerQuery(conn, 'DELETE FROM t WHERE true');
    expect(tx.rollback).not.toHaveBeenCalled();
  });

  it('Stop rolls the running transaction back', async () => {
    let stop!: () => void;
    tx.runUpdate.mockImplementation(
      () =>
        new Promise(() => {
          /* never settles */
        }),
    );
    executeSpannerQuery(conn, 'DELETE FROM t WHERE true', (cancel) => {
      stop = cancel;
    });
    await tick();
    stop();
    expect(tx.rollback).toHaveBeenCalledTimes(1);
  });

  describe('after Stop', () => {
    // Like the SDK runner: run the work again when it fails with ABORTED.
    beforeEach(() => {
      database.runTransactionAsync.mockImplementation(async (work) => {
        try {
          return await work(tx);
        } catch (error: any) {
          if (error?.code === 10) return work(tx);
          throw error;
        }
      });
    });

    const runStopped = (settleUpdate: (update: any) => void) => {
      let stop!: () => void;
      let update!: {
        resolve: (v: unknown) => void;
        reject: (e: unknown) => void;
      };
      tx.runUpdate.mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            update = { resolve, reject };
          }),
      );
      const run = executeSpannerQuery(conn, 'DELETE FROM t WHERE true', (c) => {
        stop = c;
      });
      return tick().then(() => {
        stop();
        settleUpdate(update);
        return run;
      });
    };

    it('does not retry the work when the running statement aborts', async () => {
      const result = await runStopped((u) => u.reject({ code: 10 }));
      expect(result).toEqual({ success: false, error: 'Query cancelled.' });
      expect(tx.runUpdate).toHaveBeenCalledTimes(1);
      expect(tx.commit).not.toHaveBeenCalled();
    });

    it('does not commit work that finished after Stop', async () => {
      const result = await runStopped((u) => u.resolve([1]));
      expect(result).toEqual({ success: false, error: 'Query cancelled.' });
      expect(tx.commit).not.toHaveBeenCalled();
    });
  });
});

describe('spanner DDL', () => {
  beforeEach(() => resetSpannerMock());
  afterEach(() => closeSpannerClients());

  it('sends one DDL statement and waits for the operation', async () => {
    database.updateSchema.mockResolvedValue([
      { name: 'op-1', promise: () => Promise.resolve() },
    ]);
    const result = await executeSpannerQuery(
      conn,
      'CREATE TABLE t (id INT64) PRIMARY KEY (id)',
    );
    expect(result).toEqual({
      success: true,
      isCommand: true,
      commandType: 'DDL',
    });
    expect(database.updateSchema).toHaveBeenCalledWith([
      'CREATE TABLE t (id INT64) PRIMARY KEY (id)',
    ]);
  });

  it('sends several DDL statements as one batch', async () => {
    database.updateSchema.mockResolvedValue([
      { name: 'op-1', promise: () => Promise.resolve() },
    ]);
    await executeSpannerQuery(
      conn,
      'CREATE TABLE a (id INT64) PRIMARY KEY (id); DROP TABLE b',
    );
    expect(database.updateSchema).toHaveBeenCalledWith([
      'CREATE TABLE a (id INT64) PRIMARY KEY (id)',
      'DROP TABLE b',
    ]);
  });

  it('Stop ends the wait and names the operation', async () => {
    database.updateSchema.mockResolvedValue([
      {
        name: 'op-9',
        promise: () =>
          new Promise(() => {
            /* never settles */
          }),
      },
    ]);
    let stop!: () => void;
    const run = executeSpannerQuery(conn, 'DROP TABLE t', (cancel) => {
      stop = cancel;
    });
    await tick();
    stop();
    const result = await run;
    expect(result).toMatchObject({ success: false, commandType: 'DDL' });
    expect(result.error).toContain('op-9');
    expect(result.error).toContain('may still complete');
  });

  it('reports a rejected schema change', async () => {
    database.updateSchema.mockRejectedValue({
      code: 6,
      details: 'Duplicate name in schema: t',
    });
    expect(
      await executeSpannerQuery(
        conn,
        'CREATE TABLE t (id INT64) PRIMARY KEY (id)',
      ),
    ).toEqual({
      success: false,
      error: 'Duplicate name in schema: t',
    });
  });
});

describe('spanner test connection', () => {
  beforeEach(() => resetSpannerMock());
  afterEach(() => closeSpannerClients());

  it('returns true after SELECT 1', async () => {
    database.run.mockResolvedValue([[]]);
    await expect(testSpannerConnection(conn)).resolves.toBe(true);
    expect(database.run).toHaveBeenCalledWith(
      expect.objectContaining({ sql: expect.stringContaining('SELECT 1') }),
    );
  });

  it('recovers when the emulator restarted under a cached client', async () => {
    database.run
      .mockRejectedValueOnce({ code: 5, details: 'Session not found: s/0' })
      .mockResolvedValueOnce([[]]);
    await expect(testSpannerConnection(conn)).resolves.toBe(true);
    expect(database.run).toHaveBeenCalledTimes(2);
  });

  it.each([
    [5, 'was not found'],
    [7, 'roles/spanner.databaseReader'],
    [16, 'gcloud auth application-default login'],
  ])('throws readable text for gRPC code %s', async (code, text) => {
    database.run.mockRejectedValue({ code, details: 'raw' });
    await expect(testSpannerConnection(conn)).rejects.toThrow(text);
  });
});
