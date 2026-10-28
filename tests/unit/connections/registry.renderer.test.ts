import {
  connectionAccentColor,
  connectionFormFor,
  connectionUis,
  creatableConnections,
  envFieldValueFor,
  getConnectionUi,
} from '../../../src/connections/registry.renderer';
import { CONNECTION_TYPES } from '../../../src/connections/registry.shared';

jest.mock('../../../src/renderer/controllers', () => ({}));
jest.mock('../../../src/renderer/hooks/useSecureStorage', () => ({ __esModule: true, default: () => ({}) }));
jest.mock('../../../src/renderer/controllers/connectors.controller', () => ({}));
jest.mock('../../../src/renderer/components/connections/connection-header', () => ({ __esModule: true, default: () => null }));

describe('registry.renderer', () => {
  it('keys equal type', () => {
    CONNECTION_TYPES.forEach((t) => expect(connectionUis[t].type).toBe(t));
  });

  it('creatableConnections lists the 10 types in today\'s order', () => {
    expect(creatableConnections().map((u) => u.type)).toEqual([
      'postgres', 'snowflake', 'bigquery', 'redshift', 'databricks',
      'duckdb', 'sqlite', 'kinetica', 'oracle', 'mysql',
    ]);
  });

  it('unknown types and DuckLake get the Postgres form', () => {
    const pg = connectionFormFor('postgres');
    expect(connectionFormFor('db2')).toBe(pg);
    expect(connectionFormFor('ducklake')).toBe(pg);
  });

  it('accent colors equal the old maps', () => {
    expect(connectionAccentColor('postgres')).toBe('#336791');
    expect(connectionAccentColor('mysql')).toBe('#00758f');
    expect(connectionAccentColor('oracle')).toBe('#666');
    expect(connectionAccentColor('nope')).toBe('#666');
  });

  it('env fields and values', () => {
    expect(getConnectionUi('kinetica')?.envFields).toEqual(['host', 'port', 'url', 'dbname', 'schema']);
    expect(getConnectionUi('duckdb')?.envFields).toBeUndefined();
    expect(envFieldValueFor({ type: 'postgres', host: 'h', port: 5432, database: 'd', schema: 's' }, 'port')).toBe('5432');
    expect(envFieldValueFor({ type: 'bigquery', schema: 's' }, 'dataset')).toBe('s');
    expect(envFieldValueFor({ type: 'kinetica', host: 'k', port: 9191, useSSL: false }, 'url')).toBeDefined();
  });

  it('browser auth only for Snowflake oauth_browser', () => {
    const sf = getConnectionUi('snowflake')!;
    expect(sf.browserAuth?.isEnabled({ authMethod: 'oauth_browser' })).toBe(true);
    expect(sf.browserAuth?.isEnabled({ authMethod: 'password' })).toBe(false);
    expect(getConnectionUi('postgres')?.browserAuth).toBeUndefined();
  });

  it('list details match the old screen', () => {
    expect(getConnectionUi('postgres')!.listDetails!({ host: 'h', port: 1 })).toBe('Host: h:1');
    expect(getConnectionUi('kinetica')!.listDetails).toBeUndefined();
    expect(getConnectionUi('oracle')!.listDetails!({ connectMode: 'wallet', connectString: 'x' })).toBe('Wallet alias: x');
  });
});
