import { credentialStore, getCredential } from './mocks';
import databaseStore from '../../../../src/main/database';
import ProjectsService from '../../../../src/main/services/projects.service';
import { FIXTURES, LEGACY_DB2 } from './fixtures';

jest.mock('pg', () => {
  const Client = jest.fn();
  return { __esModule: true, default: { Client }, Client };
});
const pgClient = (jest.requireMock('pg') as any).Client as jest.Mock;
const mysql = jest.requireActual('mysql2/promise').default;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const project = {
  id: 'p1',
  name: 'proj',
  path: '/nowhere',
  connectionId: 'c1',
} as any;

let fakes: { connect: jest.Mock; query: jest.Mock; end: jest.Mock }[];
const useConnection = (connection: unknown) =>
  (databaseStore.getField as jest.Mock).mockImplementation((key: string) =>
    Promise.resolve(
      key === 'connections' ? [{ id: 'c1', connection: clone(connection) }] : [],
    ),
  );

beforeEach(() => {
  credentialStore.clear();
  getCredential.mockClear();
  fakes = [];
  pgClient.mockReset().mockImplementation(() => {
    const fake = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue({ rows: [], fields: [] }),
      end: jest.fn().mockResolvedValue(undefined),
    };
    fakes.push(fake);
    return fake;
  });
});

const run = async () => {
  try {
    return { tables: await ProjectsService.extractSchema(project) };
  } catch (e) {
    return { error: (e as Error).message };
  }
};

describe('ProjectsService.extractSchema characterization', () => {
  it('postgres: config reaching pg (DIFF-7: ssl is ignored today)', async () => {
    // DIFF-7: ssl and sslRejectUnauthorized never reach the client here.
    useConnection(FIXTURES.postgres[1].conn);
    const result = await run();
    expect({ config: pgClient.mock.calls[0]?.[0], result }).toMatchSnapshot();
  });

  it('postgres: disconnects only after success (DIFF-8)', async () => {
    // DIFF-8: when extraction fails the client is not ended.
    useConnection(FIXTURES.postgres[0].conn);
    pgClient.mockImplementation(() => {
      const fake = {
        connect: jest.fn().mockResolvedValue(undefined),
        query: jest.fn().mockRejectedValue(new Error('query failed')),
        end: jest.fn().mockResolvedValue(undefined),
      };
      fakes.push(fake);
      return fake;
    });
    const result = await run();
    expect({ result, ended: fakes[0].end.mock.calls.length }).toMatchSnapshot();
  });

  it('redshift: config reaching pg', async () => {
    useConnection(FIXTURES.redshift[0].conn);
    const result = await run();
    expect({ config: pgClient.mock.calls[0]?.[0], result }).toMatchSnapshot();
  });

  it('mysql: config reaching mysql2, closed in finally', async () => {
    const connection = {
      query: jest.fn().mockResolvedValue([[], []]),
      end: jest.fn().mockResolvedValue(undefined),
      destroy: jest.fn(),
    };
    const create = jest.fn().mockResolvedValue(connection);
    mysql.createConnection = create;
    useConnection(FIXTURES.mysql[0].conn);
    const result = await run();
    expect({
      config: create.mock.calls[0]?.[0],
      result,
      ended: connection.end.mock.calls.length,
    }).toMatchSnapshot();
  });

  it('ducklake: schema extraction is not supported', async () => {
    useConnection(FIXTURES.ducklake[0].conn);
    expect(await run()).toEqual({
      error:
        'Schema extraction is not supported for DuckLake connections. DuckLake projects use dynamic data lake catalogs.',
    });
  });

  it('sqlite: unsupported', async () => {
    useConnection(FIXTURES.sqlite[0].conn);
    expect(await run()).toEqual({
      error: 'Unsupported connection type: "sqlite"',
    });
  });

  it('legacy db2: unsupported', async () => {
    useConnection(LEGACY_DB2);
    expect(await run()).toEqual({
      error: 'Unsupported connection type: "db2"',
    });
  });

  it('reads user/password by connection name, token and bigquery key by PROJECT name', async () => {
    useConnection(FIXTURES.postgres[0].conn);
    credentialStore.set('db-user-pg_plain', 'by_name_user');
    credentialStore.set('db-password-pg_plain', 'by_name_pw');
    await run();
    expect(getCredential.mock.calls.map((c) => c[0])).toEqual([
      'db-user-pg_plain',
      'db-password-pg_plain',
      'db-token-proj',
      'db-bigquery-proj',
    ]);
    expect(pgClient.mock.calls[0][0]).toMatchObject({
      user: 'by_name_user',
      password: 'by_name_pw',
    });
  });

  it('bigquery: a stored key name that is missing fails', async () => {
    useConnection({
      ...FIXTURES.bigquery[0].conn,
      keyfile: 'db-bigquery-bq_plain',
    });
    expect(await run()).toEqual({
      error: 'BigQuery service account key not found in secure storage',
    });
  });

  it('no connection configured on the project', async () => {
    await expect(
      ProjectsService.extractSchema({ ...project, connectionId: undefined }),
    ).rejects.toThrow('No database connection configured for this project');
  });
});
