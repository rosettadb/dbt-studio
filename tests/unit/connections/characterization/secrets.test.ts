import { credentialStore, getCredential } from './mocks';
import databaseStore from '../../../../src/main/database';
import ConnectorsService from '../../../../src/main/services/connectors.service';
import { allFixtures, DBT_TYPES, FIXTURES } from './fixtures';

jest.mock('pg', () => {
  const Client = jest.fn();
  return { __esModule: true, default: { Client }, Client };
});
const pgClient = (jest.requireMock('pg') as any).Client as jest.Mock;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const keysRead = () => getCredential.mock.calls.map((c) => c[0]);

beforeEach(() => {
  credentialStore.clear();
  getCredential.mockClear();
  pgClient.mockReset().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue({ rows: [], fields: [] }),
    end: jest.fn().mockResolvedValue(undefined),
  }));
});

describe('keytar keys read by the query paths', () => {
  it('executeSelectStatement reads user/password/token/bigquery by projectName', async () => {
    credentialStore.set('db-user-proj', 'store_user');
    credentialStore.set('db-password-proj', 'store_pw');
    const connection: any = clone(FIXTURES.postgres[0].conn);
    await ConnectorsService.executeSelectStatement({
      connection,
      query: 'SELECT 1',
      projectName: 'proj',
    } as any);
    expect(keysRead()).toEqual([
      'db-user-proj',
      'db-password-proj',
      'db-token-proj',
      'db-bigquery-proj',
    ]);
    // What reaches the package, not whether the input was mutated.
    expect(pgClient.mock.calls[0][0]).toMatchObject({
      user: 'store_user',
      password: 'store_pw',
    });
  });

  it('executeQueryForConnection reads by connection name, then again by project name (= connection name)', async () => {
    const stored = { id: 'c1', connection: clone(FIXTURES.postgres[0].conn) };
    (databaseStore.getField as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === 'connections' ? [stored] : undefined),
    );
    credentialStore.set('db-user-pg_plain', 'by_name_user');
    credentialStore.set('db-password-pg_plain', 'by_name_pw');
    await ConnectorsService.executeQueryForConnection({
      connectionId: 'c1',
      query: 'SELECT 1',
    });
    expect(keysRead()).toEqual([
      'db-user-pg_plain',
      'db-password-pg_plain',
      'db-token-pg_plain',
      'db-bigquery-pg_plain',
      'db-user-pg_plain',
      'db-password-pg_plain',
      'db-token-pg_plain',
      'db-bigquery-pg_plain',
    ]);
    expect(pgClient.mock.calls[0][0]).toMatchObject({
      user: 'by_name_user',
      password: 'by_name_pw',
    });
  });

  it('oracle reads db-password and db-walletpassword by connection name only', async () => {
    credentialStore.set('db-password-ora_wallet', 'ora_pw');
    credentialStore.set('db-walletpassword-ora_wallet', 'ora_wp');
    try {
      await ConnectorsService.executeSelectStatement({
        connection: clone(FIXTURES.oracle[3].conn),
        query: 'SELECT 1 FROM dual',
        projectName: 'proj',
      } as any);
    } catch {
      /* the oracledb mock may reject; only the key reads matter here */
    }
    expect(keysRead()).toEqual([
      'db-password-ora_wallet',
      'db-walletpassword-ora_wallet',
    ]);
  });
});

describe('no fixture secret leaks into generated files', () => {
  allFixtures(DBT_TYPES).forEach(({ type, label, conn }) => {
    it(`${type} (${label})`, async () => {
      const outputs: string[] = [];
      if (type !== 'ducklake') {
        outputs.push(await ConnectorsService.generateProfilesYml('proj', conn));
      }
      outputs.push(await ConnectorsService.generateJdbcUrl(conn));
      expect(outputs.join('\n')).not.toContain('FIXTURE-SECRET');
    });
  });
});
