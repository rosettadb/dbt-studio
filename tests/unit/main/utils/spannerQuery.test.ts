import { PassThrough } from 'stream';
import { PreciseDate } from '@google-cloud/precise-date';
import {
  Float,
  Float32,
  Int,
  Numeric,
  PGJsonb,
  PGNumeric,
  SpannerDate,
  Struct,
} from '@google-cloud/spanner/build/src/codec';
import {
  executeSpannerQuery,
  confirmSpannerSchemaRefreshed,
  spannerQueryInternals,
  testSpannerConnection,
} from '../../../../src/main/utils/spannerQuery';
import { acquireSpannerDatabase } from '../../../../src/main/utils/spannerClient';
import type { SpannerConnection } from '../../../../src/types/backend';
import {
  validateSpannerEmulatorHost,
  validateSpannerIds,
} from '../../../../src/shared/spanner';

jest.mock('../../../../src/main/utils/spannerClient', () => ({
  acquireSpannerDatabase: jest.fn(),
}));

const useDatabase = (database: unknown) =>
  (acquireSpannerDatabase as jest.Mock).mockResolvedValue({
    database,
    release: jest.fn(),
  });

/** A Spanner row as the SDK emits it with `json: false`. */
const cells = (...pairs: Array<[string, unknown]>) =>
  pairs.map(([name, value]) => ({ name, value }));

const flush = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

/** A database whose snapshot streams from a real Node stream. */
function useQueryDatabase() {
  const stream = new PassThrough({ objectMode: true });
  const snapshot = { runStream: jest.fn(() => stream), end: jest.fn() };
  useDatabase({ getSnapshot: jest.fn().mockResolvedValue([snapshot]) });
  return { stream, snapshot };
}

async function untilStreaming(snapshot: { runStream: jest.Mock }) {
  for (
    let i = 0;
    i < 50 && snapshot.runStream.mock.calls.length === 0;
    i += 1
  ) {
    // eslint-disable-next-line no-await-in-loop
    await flush();
  }
}

const connection: SpannerConnection = {
  type: 'spanner',
  name: 'test',
  project: 'demo-project',
  instance: 'test-instance',
  database: 'test-db',
  schema: '',
  username: 'demo-project',
  password: '',
  authMethod: 'adc',
};

describe('Spanner SQL classification and bounded query results', () => {
  it('validates Cloud resource IDs and emulator endpoints', () => {
    expect(
      validateSpannerIds({
        project: 'demo-project',
        instance: 'test-instance',
        database: 'test-db',
      }),
    ).toBeUndefined();
    expect(
      validateSpannerIds({
        project: 'Bad Project',
        instance: 'test-instance',
        database: 'test-db',
      }),
    ).toBeTruthy();
    expect(validateSpannerEmulatorHost('localhost:9010')).toBe(true);
    expect(validateSpannerEmulatorHost('localhost:70000')).toBe(false);
  });
  it('splits statements outside comments and quoted literals', () => {
    expect(
      spannerQueryInternals.splitStatements(
        "-- comment;\nSELECT ';' AS x; /* ; */ SELECT 2",
      ),
    ).toEqual(["-- comment;\nSELECT ';' AS x", '/* ; */ SELECT 2']);
  });

  it.each([
    ['/* hint */ SELECT 1', 'QUERY'],
    ['@{FORCE_INDEX=idx} SELECT 1', 'QUERY'],
    ['WITH t AS (SELECT 1) SELECT * FROM t', 'QUERY'],
    ['INSERT INTO t VALUES (1) THEN RETURN *', 'DML'],
    ['DELETE FROM t WHERE id = 1 RETURNING id', 'DML'],
    ['ALTER TABLE t ADD COLUMN x INT64', 'DDL'],
  ])('classifies %s', (sql, kind) => {
    expect(spannerQueryInternals.classify(sql)).toBe(kind);
  });

  it('rejects a mixed multi-statement batch and batches all-DDL statements', async () => {
    const updateSchema = jest
      .fn()
      .mockResolvedValue([{ promise: () => Promise.resolve() }]);
    useDatabase({ updateSchema });
    const rejected = await executeSpannerQuery(
      connection,
      'CREATE TABLE t (id INT64); SELECT 1',
    );
    expect(rejected.success).toBe(false);
    expect(updateSchema).not.toHaveBeenCalled();
    const accepted = await executeSpannerQuery(
      connection,
      'CREATE TABLE t (id INT64); ALTER TABLE t ADD COLUMN value STRING(10)',
    );
    expect(accepted).toMatchObject({ success: true, commandType: 'DDL' });
    expect(updateSchema).toHaveBeenCalledWith([
      'CREATE TABLE t (id INT64)',
      'ALTER TABLE t ADD COLUMN value STRING(10)',
    ]);
  });

  it('keeps a cancelled DDL from being retried until schema refresh', async () => {
    let finish!: () => void;
    useDatabase({
      updateSchema: () =>
        Promise.resolve([
          {
            name: 'projects/p/instances/i/databases/d/operations/op-1',
            promise: () =>
              new Promise<void>((resolve) => {
                finish = resolve;
              }),
          },
        ]),
    });
    let cancel!: () => void;
    const pending = executeSpannerQuery(
      connection,
      'CREATE TABLE t (id INT64)',
      (fn) => {
        cancel = fn;
      },
    );
    await Promise.resolve();
    cancel();
    const cancelled = await pending;
    expect(cancelled.error).toMatch(/refresh the schema/i);
    const retry = await executeSpannerQuery(
      connection,
      'CREATE TABLE t (id INT64)',
    );
    expect(retry.error).toMatch(/previous Spanner schema change/i);
    finish();
    await flush();
    confirmSpannerSchemaRefreshed(connection.name);
  });

  it('keeps blocking DDL after a refresh while the cancelled change still runs', async () => {
    const guarded = { ...connection, name: 'ddl-guard' };
    let finish!: () => void;
    const updateSchema = jest.fn().mockResolvedValue([
      {
        name: 'projects/p/instances/i/databases/d/operations/op-2',
        promise: () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      },
    ]);
    useDatabase({ updateSchema });
    let cancel!: () => void;
    const pending = executeSpannerQuery(
      guarded,
      'CREATE TABLE t (id INT64)',
      (fn) => {
        cancel = fn;
      },
    );
    await flush();
    cancel();
    await pending;

    // A refresh while the change is still running must not unlock DDL.
    confirmSpannerSchemaRefreshed(guarded.name);
    const blocked = await executeSpannerQuery(
      guarded,
      'CREATE TABLE t (id INT64)',
    );
    expect(blocked.error).toMatch(/still running/);

    finish();
    await flush();
    confirmSpannerSchemaRefreshed(guarded.name);
    updateSchema.mockResolvedValue([
      { name: 'op-3', promise: () => Promise.resolve() },
    ]);
    const retried = await executeSpannerQuery(
      guarded,
      'CREATE TABLE t (id INT64)',
    );
    expect(retried).toMatchObject({ success: true, commandType: 'DDL' });
  });

  it('keeps blocking DDL when a change fails after its wait was cancelled', async () => {
    // A batch can apply some statements before one fails, so the schema still
    // has to be refreshed and checked before a retry.
    const guarded = { ...connection, name: 'ddl-guard-failed' };
    let fail!: (error: Error) => void;
    const updateSchema = jest.fn().mockResolvedValue([
      {
        name: 'op-4',
        promise: () =>
          new Promise<void>((_resolve, reject) => {
            fail = reject;
          }),
      },
    ]);
    useDatabase({ updateSchema });
    let cancel!: () => void;
    const pending = executeSpannerQuery(
      guarded,
      'CREATE TABLE a (id INT64) PRIMARY KEY (id); CREATE TABLE a (id INT64) PRIMARY KEY (id)',
      (fn) => {
        cancel = fn;
      },
    );
    await flush();
    cancel();
    await pending;
    fail(new Error('Duplicate name in schema: a.'));
    await flush();

    const blocked = await executeSpannerQuery(
      guarded,
      'CREATE TABLE b (id INT64) PRIMARY KEY (id)',
    );
    expect(blocked.error).toMatch(/finished after its wait was cancelled/);

    confirmSpannerSchemaRefreshed(guarded.name);
    updateSchema.mockResolvedValue([
      { name: 'op-5', promise: () => Promise.resolve() },
    ]);
    const retried = await executeSpannerQuery(
      guarded,
      'CREATE TABLE b (id INT64) PRIMARY KEY (id)',
    );
    expect(retried).toMatchObject({ success: true, commandType: 'DDL' });
  });
});

describe('query streaming (B2)', () => {
  it('stops at the row past the cap without waiting for the stream to end', async () => {
    const { stream, snapshot } = useQueryDatabase();
    const pending = executeSpannerQuery(connection, 'SELECT id FROM t');
    await untilStreaming(snapshot);
    // No end(): the stream stays open, as it does when the 10,001st row is
    // the last row of a chunk.
    for (let i = 0; i < 10_001; i += 1) stream.write(cells(['id', i]));
    const result = await pending;
    expect(result.data).toHaveLength(10_000);
    expect(result.truncated).toBe(true);
    expect(stream.destroyed).toBe(true);
    expect(snapshot.end).toHaveBeenCalledTimes(1);
  });

  it('reports truncation when the result has exactly 10,001 rows', async () => {
    const { stream, snapshot } = useQueryDatabase();
    const pending = executeSpannerQuery(connection, 'SELECT id FROM t');
    await untilStreaming(snapshot);
    for (let i = 0; i < 10_001; i += 1) stream.write(cells(['id', i]));
    stream.end();
    const result = await pending;
    expect(result.data).toHaveLength(10_000);
    expect(result.truncated).toBe(true);
    expect(snapshot.end).toHaveBeenCalledTimes(1);
  });

  it('does not flag exactly 10,000 rows as truncated', async () => {
    const { stream, snapshot } = useQueryDatabase();
    const pending = executeSpannerQuery(connection, 'SELECT id FROM t');
    await untilStreaming(snapshot);
    for (let i = 0; i < 10_000; i += 1) stream.write(cells(['id', i]));
    stream.end();
    const result = await pending;
    expect(result.data).toHaveLength(10_000);
    expect(result.truncated).toBe(false);
  });

  it.each([
    ['before any data', 0],
    ['mid-stream', 3],
  ])(
    'settles a Stop %s and releases the snapshot',
    async (_label, rowsBeforeStop) => {
      const { stream, snapshot } = useQueryDatabase();
      let cancel!: () => void;
      const pending = executeSpannerQuery(
        connection,
        'SELECT id FROM t',
        (fn) => {
          cancel = fn;
        },
      );
      await untilStreaming(snapshot);
      for (let i = 0; i < rowsBeforeStop; i += 1)
        stream.write(cells(['id', i]));
      await flush();
      cancel();
      const result = await pending;
      expect(result).toMatchObject({
        success: false,
        error: 'Query cancelled.',
      });
      expect(stream.destroyed).toBe(true);
      expect(snapshot.end).toHaveBeenCalledTimes(1);
    },
  );

  it('fails instead of hanging when the stream closes before it ends', async () => {
    const { stream, snapshot } = useQueryDatabase();
    const pending = executeSpannerQuery(connection, 'SELECT id FROM t');
    await untilStreaming(snapshot);
    stream.destroy();
    const result = await pending;
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/closed before it finished/);
  });
});

describe('result columns and values (B3)', () => {
  it('keeps nameless and duplicate columns and shows zero-row headers', async () => {
    const { stream, snapshot } = useQueryDatabase();
    const pending = executeSpannerQuery(
      connection,
      'SELECT COUNT(*), a.id, b.id',
    );
    await untilStreaming(snapshot);
    stream.emit('response', {
      metadata: {
        rowType: { fields: [{ name: '' }, { name: 'id' }, { name: 'id' }] },
      },
    });
    stream.write(
      cells(['', new Int('42')], ['id', new Int('7')], ['id', 'b-7']),
    );
    stream.end();
    const result = await pending;
    expect(result.fields?.map((field) => field.name)).toEqual([
      '_0',
      'id',
      'id_2',
    ]);
    expect(result.data).toEqual([{ _0: '42', id: '7', id_2: 'b-7' }]);

    const empty = useQueryDatabase();
    const emptyPending = executeSpannerQuery(
      connection,
      'SELECT a, b FROM t WHERE false',
    );
    await untilStreaming(empty.snapshot);
    empty.stream.emit('response', {
      metadata: { rowType: { fields: [{ name: 'a' }, { name: 'b' }] } },
    });
    empty.stream.end();
    const emptyResult = await emptyPending;
    expect(emptyResult.fields?.map((field) => field.name)).toEqual(['a', 'b']);
    expect(emptyResult.data).toEqual([]);
  });

  it.each([
    [
      'INT64 beyond 2^53',
      () => new Int('9007199254740993'),
      '9007199254740993',
    ],
    ['FLOAT64', () => new Float(1.5), 1.5],
    ['FLOAT32', () => new Float32(2.25), 2.25],
    ['FLOAT64 NaN', () => new Float(Number.NaN), 'NaN'],
    ['NUMERIC', () => new Numeric('12.50'), '12.50'],
    ['PG NUMERIC', () => new PGNumeric('99.10'), '99.10'],
    ['PG JSONB', () => new PGJsonb({ b: 2 }), '{"b":2}'],
    ['GoogleSQL JSON with a value key', () => ({ value: 3 }), '{"value":3}'],
    [
      'DATE as YYYY-MM-DD, not a shifted timestamp',
      () => new SpannerDate('2024-01-02'),
      '2024-01-02',
    ],
    [
      'TIMESTAMP with nanoseconds',
      () => new PreciseDate('2024-01-02T03:04:05.123456789Z'),
      '2024-01-02T03:04:05.123456789Z',
    ],
    ['BYTES', () => Buffer.from('hello'), '<BYTES 5 bytes>'],
    ['ARRAY<INT64>', () => [new Int('1'), new Int('2')], '["1","2"]'],
    [
      'STRUCT with a nameless field',
      () =>
        Struct.fromArray([
          { name: 'a', value: new Int('5') },
          { name: '', value: 'x' },
        ]),
      '{"a":"5","_1":"x"}',
    ],
    ['NULL', () => null, null],
    ['BOOL', () => true, true],
  ])('maps %s', (_label, makeValue, expected) => {
    expect(spannerQueryInternals.cellValue(makeValue())).toEqual(expected);
  });

  it('gives repeated column names unique suffixes', () => {
    expect(
      spannerQueryInternals.uniqueColumnNames(['', 'id', 'id', 'id_2']),
    ).toEqual(['_0', 'id', 'id_2', 'id_2_2']);
  });
});

describe('DML (B1)', () => {
  it('passes request options inside the runUpdate request, not as a second argument', async () => {
    const tx = {
      runUpdate: jest.fn().mockResolvedValue([3]),
      commit: jest.fn().mockResolvedValue([]),
    };
    useDatabase({ runTransactionAsync: (work: any) => work(tx) });
    const sql = 'UPDATE t SET x = 1 WHERE true';
    const result = await executeSpannerQuery(connection, sql);
    expect(tx.runUpdate.mock.calls).toEqual([
      [{ sql, gaxOptions: { timeout: 10 * 60_000 } }],
    ]);
    expect(tx.commit).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: true,
      isCommand: true,
      rowCount: 3,
    });
  });

  it('returns THEN RETURN rows with names from the result metadata', async () => {
    const tx = {
      run: jest
        .fn()
        .mockResolvedValue([
          [cells(['id', new Int('5')], ['name', 'x'])],
          { rowCountExact: '1' },
          { rowType: { fields: [{ name: 'id' }, { name: 'name' }] } },
        ]),
      commit: jest.fn().mockResolvedValue([]),
    };
    useDatabase({ runTransactionAsync: (work: any) => work(tx) });
    const result = await executeSpannerQuery(
      connection,
      "INSERT INTO t (id, name) VALUES (5, 'x') THEN RETURN id, name",
    );
    expect(tx.run.mock.calls[0][0]).toMatchObject({ json: false });
    expect(result.fields?.map((field) => field.name)).toEqual(['id', 'name']);
    expect(result.data).toEqual([{ id: '5', name: 'x' }]);
  });

  it('rolls back a failed DML statement so no transaction stays open', async () => {
    const tx = {
      runUpdate: jest
        .fn()
        .mockRejectedValue(
          Object.assign(new Error('Row [1] already exists'), { code: 6 }),
        ),
      commit: jest.fn().mockResolvedValue([]),
      rollback: jest.fn().mockResolvedValue([]),
    };
    useDatabase({ runTransactionAsync: (work: any) => work(tx) });
    const result = await executeSpannerQuery(
      connection,
      'INSERT INTO t (id) VALUES (1)',
    );
    expect(result).toMatchObject({
      success: false,
      error: 'Row [1] already exists',
    });
    expect(tx.rollback).toHaveBeenCalledTimes(1);
    expect(tx.commit).not.toHaveBeenCalled();
  });

  it('rolls back a failed THEN RETURN statement', async () => {
    const tx = {
      run: jest.fn().mockRejectedValue(new Error('Column not found: nope')),
      commit: jest.fn().mockResolvedValue([]),
      rollback: jest.fn().mockResolvedValue([]),
    };
    useDatabase({ runTransactionAsync: (work: any) => work(tx) });
    const result = await executeSpannerQuery(
      connection,
      'DELETE FROM t WHERE true THEN RETURN nope',
    );
    expect(result.success).toBe(false);
    expect(tx.rollback).toHaveBeenCalledTimes(1);
    expect(tx.commit).not.toHaveBeenCalled();
  });

  it('keeps the original error when the rollback itself fails', async () => {
    const tx = {
      runUpdate: jest.fn().mockRejectedValue(new Error('Deadline exceeded')),
      commit: jest.fn(),
      rollback: jest.fn().mockRejectedValue(new Error('rollback failed')),
    };
    useDatabase({ runTransactionAsync: (work: any) => work(tx) });
    const result = await executeSpannerQuery(
      connection,
      'UPDATE t SET x = 1 WHERE true',
    );
    expect(result.error).toBe('Deadline exceeded');
  });

  it('leaves ABORTED transactions to the SDK retry instead of rolling back', async () => {
    const aborted = Object.assign(new Error('Transaction was aborted.'), {
      code: 10,
    });
    const tx = {
      runUpdate: jest.fn().mockRejectedValue(aborted),
      commit: jest.fn(),
      rollback: jest.fn().mockResolvedValue([]),
    };
    useDatabase({ runTransactionAsync: (work: any) => work(tx) });
    await executeSpannerQuery(connection, 'UPDATE t SET x = 1 WHERE true');
    expect(tx.rollback).not.toHaveBeenCalled();
  });
});

describe('readable error messages', () => {
  it.each([
    [5, /not found.*project, instance, and database/is],
    [7, /permission.*roles\/spanner\.databaseReader/is],
    [16, /gcloud auth application-default login/],
  ])('maps gRPC code %s to a readable message', async (code, pattern) => {
    const { stream, snapshot } = useQueryDatabase();
    const pending = executeSpannerQuery(connection, 'SELECT 1');
    await untilStreaming(snapshot);
    stream.destroy(Object.assign(new Error('rpc error'), { code }));
    const result = await pending;
    expect(result.success).toBe(false);
    expect(result.error).toMatch(pattern);
    expect(snapshot.end).toHaveBeenCalledTimes(1);
  });
});

describe('Test connection errors', () => {
  it.each([
    [5, /not found/i],
    [7, /roles\/spanner\.databaseReader/],
    [16, /gcloud auth application-default login/],
  ])('throws a readable message for gRPC code %s', async (code, pattern) => {
    useDatabase({
      run: jest
        .fn()
        .mockRejectedValue(
          Object.assign(new Error(`${code} RAW: details`), { code }),
        ),
    });
    await expect(testSpannerConnection(connection)).rejects.toThrow(pattern);
  });

  it('keeps the message of errors without a gRPC code', async () => {
    (acquireSpannerDatabase as jest.Mock).mockRejectedValue(
      new Error('Spanner service account key not found in secure storage.'),
    );
    await expect(testSpannerConnection(connection)).rejects.toThrow(
      'Spanner service account key not found in secure storage.',
    );
  });
});
