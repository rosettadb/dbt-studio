import './mocks';
import ConnectorsService from '../../../../src/main/services/connectors.service';
import DuckLakeService from '../../../../src/main/services/duckLake.service';
import { FIXTURES } from './fixtures';

jest.mock('pg', () => {
  const Client = jest.fn();
  return { __esModule: true, default: { Client }, Client };
});

const pgClient = (jest.requireMock('pg') as any).Client as jest.Mock;
const mysql2 = (jest.requireActual('mysql2/promise') as any).default ?? {
  createConnection: undefined,
};
const SqliteDatabase = (jest.requireMock('better-sqlite3') as any)
  .default as jest.Mock;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

type PgFake = {
  connect: jest.Mock;
  query: jest.Mock;
  end: jest.Mock;
};
let lastPg: PgFake;

const pgQueryResult = {
  rows: [{ id: 1, name: 'a' }],
  fields: [
    { name: 'id', dataTypeID: 23 },
    { name: 'name', dataTypeID: 25 },
  ],
  rowCount: 1,
};

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
  pgClient.mockReset().mockImplementation(() => {
    lastPg = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue(pgQueryResult),
      end: jest.fn().mockResolvedValue(undefined),
    };
    return lastPg;
  });
});
afterEach(() => jest.restoreAllMocks());

const select = (connection: any, query = 'SELECT 1', queryId?: string) =>
  ConnectorsService.executeSelectStatement({
    connection,
    query,
    projectName: 'proj',
    queryId,
  } as any);

describe('postgres routing', () => {
  FIXTURES.postgres.forEach(({ label, conn }) => {
    it(`executeSelectStatement (${label})`, async () => {
      const response = await select(clone(conn));
      expect({
        clientConfig: pgClient.mock.calls[0][0],
        sql: lastPg.query.mock.calls[0][0],
        response,
        closed: lastPg.end.mock.calls.length,
      }).toMatchSnapshot();
    });
  });

  it('testConnection returns true when the probe returns 1', async () => {
    pgClient.mockImplementation(() => {
      lastPg = {
        connect: jest.fn().mockResolvedValue(undefined),
        query: jest.fn().mockResolvedValue({ rows: [{ connection_test: 1 }] }),
        end: jest.fn().mockResolvedValue(undefined),
      };
      return lastPg;
    });
    await expect(
      ConnectorsService.testConnection(clone(FIXTURES.postgres[0].conn)),
    ).resolves.toBe(true);
  });

  it('cancelQuery ends the running client, and is a no-op for unknown ids', async () => {
    let release: () => void = () => undefined;
    pgClient.mockImplementation(() => {
      lastPg = {
        connect: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(
          () =>
            new Promise((resolve) => {
              release = () => resolve(pgQueryResult);
            }),
        ),
        end: jest.fn().mockResolvedValue(undefined),
      };
      return lastPg;
    });
    const running = select(clone(FIXTURES.postgres[0].conn), 'SELECT 1', 'q1');
    await new Promise((r) => setTimeout(r, 10));
    await ConnectorsService.cancelQuery('q1');
    expect(lastPg.end).toHaveBeenCalledTimes(1);
    await ConnectorsService.cancelQuery('does-not-exist');
    release();
    await running;
  });
});

describe('redshift routing', () => {
  FIXTURES.redshift.forEach(({ label, conn }) => {
    it(`executeSelectStatement (${label})`, async () => {
      const fs = jest.requireActual('fs');
      jest.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('CERT'));
      const response = await select(clone(conn));
      expect({
        clientConfig: pgClient.mock.calls[0][0],
        response,
        closed: lastPg.end.mock.calls.length,
      }).toMatchSnapshot();
    });
  });
});

describe('mysql routing', () => {
  it('executeSelectStatement returns rows and closes the connection', async () => {
    const connection = {
      query: jest.fn().mockResolvedValue([[{ id: 1 }], []]),
      end: jest.fn().mockResolvedValue(undefined),
      destroy: jest.fn(),
    };
    const create = jest.fn().mockResolvedValue(connection);
    (jest.requireActual('mysql2/promise') as any).default.createConnection =
      create;
    const response = await select(clone(FIXTURES.mysql[0].conn));
    expect({
      config: create.mock.calls[0][0],
      sql: connection.query.mock.calls[0][0],
      response,
      closed: connection.end.mock.calls.length,
    }).toMatchSnapshot();
  });

  it('classifies non-select statements', async () => {
    const connection = {
      query: jest.fn().mockResolvedValue([{ affectedRows: 3 }, []]),
      end: jest.fn().mockResolvedValue(undefined),
      destroy: jest.fn(),
    };
    (jest.requireActual('mysql2/promise') as any).default.createConnection =
      jest.fn().mockResolvedValue(connection);
    const response = await select(
      clone(FIXTURES.mysql[0].conn),
      'update t set a = 1',
    );
    expect(response).toMatchSnapshot();
  });
  void mysql2;
});

describe('sqlite routing', () => {
  it('executeSelectStatement reads rows through better-sqlite3', async () => {
    const close = jest.fn();
    SqliteDatabase.mockReset().mockImplementation(() => ({
      close,
      prepare: () => ({
        reader: true,
        columns: () => [{ name: 'id' }],
        all: () => [{ id: 1 }],
      }),
    }));
    const response = await select(clone(FIXTURES.sqlite[0].conn));
    expect({
      ctorArgs: SqliteDatabase.mock.calls[0],
      response,
      closed: close.mock.calls.length,
    }).toMatchSnapshot();
  });

  it('cancelQuery is a no-op', async () => {
    await expect(
      ConnectorsService.cancelQuery('sqlite-q'),
    ).resolves.toBeUndefined();
  });
});

describe('bigquery and ducklake routing', () => {
  it('cancelQuery is a no-op for bigquery (nothing is registered)', async () => {
    await expect(
      ConnectorsService.cancelQuery('bq-q'),
    ).resolves.toBeUndefined();
  });

  it('ducklake executeSelectStatement is not implemented', async () => {
    await expect(select(clone(FIXTURES.ducklake[0].conn))).resolves.toEqual(
      expect.objectContaining({
        success: false,
        error: 'DuckLake query execution not yet implemented',
      }),
    );
  });

  it('ducklake testConnection checks the instance exists', async () => {
    const get = DuckLakeService.getInstance as jest.Mock;
    get.mockResolvedValueOnce({ id: 'inst-s3' });
    await expect(
      ConnectorsService.testConnection(clone(FIXTURES.ducklake[0].conn)),
    ).resolves.toBe(true);
    get.mockResolvedValueOnce(undefined);
    await expect(
      ConnectorsService.testConnection(clone(FIXTURES.ducklake[0].conn)),
    ).resolves.toBe(false);
    get.mockRejectedValueOnce(new Error('boom'));
    await expect(
      ConnectorsService.testConnection(clone(FIXTURES.ducklake[0].conn)),
    ).resolves.toBe(false);
  });
});

describe('unsupported types', () => {
  it('testConnection rejects db2 at validation', async () => {
    await expect(
      ConnectorsService.testConnection({ type: 'db2', name: 'old' } as any),
    ).rejects.toThrow('Unsupported connection type!');
  });
});
