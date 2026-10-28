import './mocks';
import ConnectorsService from '../../../../src/main/services/connectors.service';
import * as oracleClient from '../../../../src/connections/oracle/oracle.client.main';
import { ConnectionInput } from '../../../../src/types/backend';
import { ALL_TYPES, FIXTURES, LEGACY_DB2 } from './fixtures';

const validate = (c: ConnectionInput) => ConnectorsService.validateConnection(c);

describe('validateConnection characterization', () => {
  beforeEach(() => {
    jest
      .spyOn(oracleClient, 'listOracleWalletAliases')
      .mockResolvedValue(['mydb_high']);
  });
  afterEach(() => jest.restoreAllMocks());

  ALL_TYPES.forEach((type) => {
    FIXTURES[type].forEach(({ label, conn }) => {
      it(`${type} (${label}) passes`, async () => {
        await expect(validate(conn)).resolves.toBeUndefined();
      });
    });
  });

  const required: [string, string, string][] = [
    ['postgres', 'host', 'Host is required'],
    ['postgres', 'port', 'Port is required'],
    ['redshift', 'host', 'Host is required'],
    ['redshift', 'port', 'Port is required'],
    ['mysql', 'host', 'Host is required'],
    ['mysql', 'port', 'Port is required'],
    ['snowflake', 'account', 'Snowflake account is required'],
    ['snowflake', 'warehouse', 'Warehouse is required'],
    ['bigquery', 'project', 'Project ID is required'],
    ['databricks', 'host', 'Host is required'],
    ['databricks', 'httpPath', 'HTTP Path is required'],
    ['databricks', 'token', 'Access token is required'],
    ['duckdb', 'database_path', 'Database path is required'],
    ['sqlite', 'database_path', 'Database path is required'],
    ['ducklake', 'instanceId', 'DuckLake instance ID is required'],
    ['kinetica', 'host', 'Host is required'],
    ['kinetica', 'port', 'Port is required'],
    ['oracle', 'username', 'Username is required'],
  ];
  required.forEach(([type, field, message]) => {
    it(`${type} without ${field} throws "${message}"`, async () => {
      const copy: any = { ...FIXTURES[type][0].conn };
      delete copy[field];
      await expect(validate(copy)).rejects.toThrow(message);
    });
  });

  it('requires a type', async () => {
    const copy: any = { ...FIXTURES.postgres[0].conn };
    delete copy.type;
    await expect(validate(copy)).rejects.toThrow('Connection type is required');
  });

  it('rejects the legacy db2 type', async () => {
    await expect(validate(LEGACY_DB2)).rejects.toThrow(
      'Unsupported connection type!',
    );
  });

  it('oracle wallet mode checks the wallet aliases', async () => {
    const spy = jest.spyOn(oracleClient, 'listOracleWalletAliases');
    await validate(FIXTURES.oracle[3].conn);
    expect(spy).toHaveBeenCalledWith('/wallets/mydb');
    spy.mockRejectedValueOnce(new Error('No tnsnames.ora'));
    await expect(validate(FIXTURES.oracle[3].conn)).rejects.toThrow(
      'No tnsnames.ora',
    );
  });
});
