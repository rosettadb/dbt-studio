import './characterization/mocks';
import {
  connectors,
  dbtConnectorForAdapter,
  findConnector,
  findSecretMaterializer,
  getConnector,
  sanitizeForStorage,
  agentHintFor,
} from '../../../src/connections/registry.main';
import { ConnectionDbt } from '../../../src/connections/core/ConnectionDbt.main';
import { connectionDescriptors } from '../../../src/connections/registry.shared';

describe('registry.main', () => {
  it('keys equal descriptor types', () => {
    Object.entries(connectors).forEach(([key, c]) => {
      expect(c.type).toBe(key);
      expect(c.descriptor).toBe(
        (connectionDescriptors as Record<string, unknown>)[key],
      );
    });
  });

  it('descriptor.capabilities.dbt matches ConnectionDbt', () => {
    Object.values(connectors).forEach((c) => {
      expect(c.descriptor.capabilities.dbt).toBe(c instanceof ConnectionDbt);
    });
  });

  it('adapter lookup is unique and empty for query-only types', () => {
    ['postgres', 'redshift', 'snowflake', 'bigquery', 'databricks', 'duckdb', 'kinetica'].forEach((a) => {
      expect(dbtConnectorForAdapter(a)?.type).toBe(a);
    });
    ['mysql', 'sqlite', 'oracle', 'ducklake'].forEach((a) => {
      expect(dbtConnectorForAdapter(a)).toBeUndefined();
    });
  });

  it('handles unknown, prototype and alias lookups', () => {
    ['db2', 'constructor', ''].forEach((t) =>
      expect(getConnector(t)).toBeUndefined(),
    );
    expect(findConnector('postgresql')?.type).toBe('postgres');
  });

  it('finds the BigQuery secret materializer only', () => {
    expect(findSecretMaterializer('db-bigquery-x')?.connectionName).toBe('x');
    expect(findSecretMaterializer('db-user-x')).toBeUndefined();
  });

  it('sanitizeForStorage replaces a raw BigQuery keyfile only', () => {
    const bq = { connection: { type: 'bigquery', name: 'b', keyfile: '{"a":1}' } };
    sanitizeForStorage(bq as any);
    expect(bq.connection.keyfile).toBe('db-bigquery-b');
    const pg = { connection: { type: 'postgres', name: 'p', keyfile: '{x' } };
    sanitizeForStorage(pg as any);
    expect(pg.connection.keyfile).toBe('{x');
  });

  it('agent hints: default text for unknown types, Postgres alias', () => {
    expect(agentHintFor('weird', 'sql')).toContain('a weird database');
    expect(agentHintFor('postgresql', 'sql')).toContain('PostgreSQL');
    expect(agentHintFor('oracle', 'notebooks')).toContain('Oracle Database');
    expect(agentHintFor('oracle', 'sql')).toContain('## Oracle SQL');
    expect(agentHintFor('mysql', 'sql')).toContain('a mysql database');
    expect(agentHintFor('ducklake', 'sql')).toContain('DuckLake Specifics');
  });
});
