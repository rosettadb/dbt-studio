import type { QueryResponseType, Table } from '../../types/backend';
import { ConnectionDbt } from '../core/ConnectionDbt.main';
import type { QueryContext, TestResult } from '../core/Connection.main';
import type { AgentHintContext } from '../core/agentHints.main';
import {
  databricksDescriptor,
  type DatabricksConnection,
  type DatabricksDBTConnection,
} from './databricks.shared';
import {
  executeDatabricksQuery,
  testDatabricksConnection,
} from './databricks.client.main';
import DatabricksExtractor from './databricks.extractor.main';

export class DatabricksConnector extends ConnectionDbt<
  DatabricksConnection,
  DatabricksDBTConnection
> {
  readonly descriptor = databricksDescriptor;

  readonly dbtAdapterType = 'databricks';

  // CS validateConnection (1285-1289)
  async validate(conn: DatabricksConnection): Promise<void> {
    if (!conn.host) throw new Error('Host is required');
    if (!('httpPath' in conn)) throw new Error('HTTP Path is required');
    if (!conn.token) throw new Error('Access token is required');
  }

  // CS testConnection (904-905)
  test(conn: DatabricksConnection): Promise<TestResult> {
    return testDatabricksConnection(conn);
  }

  // CS executeSelectStatement (1095-1101)
  query(
    conn: DatabricksConnection,
    sql: string,
    ctx: QueryContext,
  ): Promise<QueryResponseType> {
    return executeDatabricksQuery(conn, sql, ctx.onCancelable);
  }

  // CS extractSchemaFromConnection (2302-2318), `dbConn` -> `conn`
  async extractSchema(
    conn: DatabricksConnection,
  ): Promise<{ tables: Table[] }> {
    const extractor = new DatabricksExtractor({
      token: conn.token,
      host: conn.host,
      path: conn.httpPath,
      catalog: conn.database || 'default',
      schema: conn.schema,
    });
    try {
      await extractor.connect();
      const schema = await extractor.extractSchema();
      return schema;
    } finally {
      await extractor.disconnect();
    }
  }

  // CS areConnectionConfigsEqual (293-304)
  sameTarget(a: DatabricksConnection, b: DatabricksConnection): boolean {
    return (
      a.host === b.host &&
      a.httpPath === b.httpPath &&
      a.database === b.database &&
      a.schema === b.schema
    );
  }

  // CS generateUniqueConnectionName (407-409)
  nameHint(conn: DatabricksConnection): string {
    return conn.database;
  }

  // sqlAgent.ts 88-91; identical in the three agents
  agentHint(_ctx: AgentHintContext): string {
    return '\n\n## Dialect Specifics\nYou are connected to Databricks. Ensure all queries use Databricks/Spark SQL syntax and functions.';
  }

  // CS mapToDbtConnection (1472-1482)
  toDbtConnection(conn: DatabricksConnection): DatabricksDBTConnection {
    // Special case for Databricks with token auth
    return {
      type: 'databricks',
      host: conn.host,
      port: conn.port,
      http_path: conn.httpPath,
      token: `db-token-${conn.name}`, // Use token directly
      database: conn.database,
      schema: conn.schema,
    };
  }

  // CS mapToDbtProfileOutput (1620-1629)
  async toProfileOutput(
    conn: DatabricksConnection,
  ): Promise<Record<string, unknown>> {
    return {
      type: 'databricks',
      host: this.profileRef(conn, 'host'),
      http_path: this.profileRef(conn, 'httppath'),
      token: this.profileRef(conn, 'token'),
      catalog: this.profileRef(conn, 'catalog'),
      schema: this.profileRef(conn, 'schema'),
      threads: 4,
    };
  }

  // CS parseProfilesYml (1821-1831)
  fromProfileOutput(devOutput: Record<string, any>): DatabricksDBTConnection {
    return {
      type: 'databricks',
      host: devOutput.host,
      port: devOutput.port || 443,
      http_path: devOutput.http_path,
      token: devOutput.token,
      database: devOutput.catalog,
      schema: devOutput.schema,
    };
  }

  // CS mapDBTConnectionToConnectionInput (1951-1963)
  toConnectionInput(
    dbtConnection: DatabricksDBTConnection,
    connectionName: string,
  ): DatabricksConnection {
    return {
      type: 'databricks',
      name: connectionName,
      host: dbtConnection.host,
      port: dbtConnection.port,
      httpPath: dbtConnection.http_path, // Note: property name differs between types
      token: dbtConnection.token,
      database: dbtConnection.catalog || dbtConnection.database,
      schema: dbtConnection.schema,
      keepalives_idle: dbtConnection.keepalives_idle,
    };
  }

  // CS generateJdbcUrl (1343-1344)
  toJdbcUrl(conn: DatabricksConnection): string {
    return `jdbc:databricks://${this.rosettaRef(conn, 'host')}:443/default;transportMode=http;ssl=1;AuthMech=3;httpPath=${this.rosettaRef(conn, 'httppath')};PWD=${this.rosettaRef(conn, 'token')}`;
  }

  // CS generateRosettaYml (1177-1179)
  protected mainConfNames(conn: DatabricksConnection): {
    databaseName: string;
    schemaName: string;
  } {
    return {
      databaseName: this.rosettaRef(conn, 'catalog'),
      schemaName: this.rosettaRef(conn, 'schema'),
    };
  }

  // Databricks gets no user or password in main.conf (CS 1228-1232)
  protected async mainConfExtras(): Promise<Record<string, unknown>> {
    return {};
  }

  // mapToRosettaConnection adds no credentials for Databricks (CS 1393-1396)
  protected rosettaCredentialRefs(): Record<string, never> {
    return {};
  }

  // yamlPartialUpdate.updateMainConf: the token is embedded in the URL
  mainConfKeysToRemove(): string[] {
    return ['userName', 'password', 'authenticator', 'token'];
  }
}
