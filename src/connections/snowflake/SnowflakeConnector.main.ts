import type {
  QueryResponseType,
  RosettaConnection,
  Table,
} from '../../types/backend';
import { ConnectionDbt } from '../core/ConnectionDbt.main';
import type { QueryContext, TestResult } from '../core/Connection.main';
import type { AgentHintContext } from '../core/agentHints.main';
import {
  snowflakeDescriptor,
  type SnowflakeConnection,
  type SnowflakeDBTConnection,
} from './snowflake.shared';
import {
  executeSnowflakeQuery,
  testSnowflakeConnection,
} from './snowflake.client.main';
import SnowflakeExtractor from './snowflake.extractor.main';

export class SnowflakeConnector extends ConnectionDbt<
  SnowflakeConnection,
  SnowflakeDBTConnection
> {
  readonly descriptor = snowflakeDescriptor;

  readonly dbtAdapterType = 'snowflake';

  // CS validateConnection (1278-1281)
  async validate(conn: SnowflakeConnection): Promise<void> {
    if (!conn.account) throw new Error('Snowflake account is required');
    if (!('warehouse' in conn)) throw new Error('Warehouse is required');
  }

  // CS testConnection (896-901): errors become `false`
  async test(conn: SnowflakeConnection): Promise<TestResult> {
    try {
      return await testSnowflakeConnection(conn);
    } catch {
      return false;
    }
  }

  // CS executeSelectStatement (1084-1090)
  query(
    conn: SnowflakeConnection,
    sql: string,
    ctx: QueryContext,
  ): Promise<QueryResponseType> {
    return executeSnowflakeQuery(conn, sql, ctx.onCancelable);
  }

  // CS extractSchemaFromConnection (2277-2301), `sfConn` -> `conn`
  async extractSchema(conn: SnowflakeConnection): Promise<{ tables: Table[] }> {
    const sfAuthMethod =
      conn.authMethod === 'oauth_browser' ? 'oauth_browser' : 'password';
    const extractor = new SnowflakeExtractor({
      account:
        sfAuthMethod === 'oauth_browser'
          ? conn.account
          : conn.account.split('.')[0],
      username: conn.username,
      password: conn.password,
      warehouse: conn.warehouse,
      database: conn.database,
      schema: conn.schema,
      role: conn.role,
      authMethod: sfAuthMethod,
    });
    try {
      await extractor.connect();
      const schema = await extractor.extractSchema();
      return schema;
    } finally {
      await extractor.disconnect();
    }
  }

  // CS areConnectionConfigsEqual (253-266)
  sameTarget(a: SnowflakeConnection, b: SnowflakeConnection): boolean {
    return (
      a.account === b.account &&
      a.database === b.database &&
      a.username === b.username &&
      a.warehouse === b.warehouse &&
      a.schema === b.schema
    );
  }

  // CS generateUniqueConnectionName (401-403)
  nameHint(conn: SnowflakeConnection): string {
    return `${conn.database}`;
  }

  // sqlAgent.ts 80-83; identical in the three agents
  agentHint(_ctx: AgentHintContext): string {
    return '\n\n## Dialect Specifics\nYou are connected to Snowflake. Ensure all queries use Snowflake SQL syntax and functions.';
  }

  // CS mapToDbtConnection (1417-1435)
  toDbtConnection(conn: SnowflakeConnection): SnowflakeDBTConnection {
    const isSnowflakeOauth = conn.authMethod === 'oauth_browser';
    return {
      type: 'snowflake',
      username: `db-user-${conn.name}`,
      ...(isSnowflakeOauth
        ? {
            authMethod: 'oauth_browser' as const,
            authenticator: 'oauth_authorization_code' as const,
          }
        : { password: `db-password-${conn.name}` }),
      database: conn.database,
      schema: conn.schema,
      account: conn.account,
      warehouse: conn.warehouse,
      ...(conn.role && { role: conn.role }),
    };
  }

  // CS mapToDbtProfileOutput (1562-1585)
  async toProfileOutput(
    conn: SnowflakeConnection,
  ): Promise<Record<string, unknown>> {
    const isSnowflakeOauth = conn.authMethod === 'oauth_browser';
    return {
      type: 'snowflake',
      account: this.profileRef(conn, 'account'),
      user: this.profileRef(conn, 'user'),
      ...(isSnowflakeOauth
        ? {
            // Token comes from `db-token-<name>` process env, materialized
            // main-side from the live SDK session at dbt run time (never
            // written to files). Plain `oauth` never opens a browser: a
            // missing/expired token fails fast with guidance instead.
            authenticator: 'oauth',
            token: this.profileRef(conn, 'token'),
          }
        : { password: this.profileRef(conn, 'password') }),
      ...(conn.role && { role: this.profileRef(conn, 'role') }),
      warehouse: this.profileRef(conn, 'warehouse'),
      database: this.profileRef(conn, 'dbname'),
      schema: this.profileRef(conn, 'schema'),
      threads: 4,
    };
  }

  // yamlPartialUpdate.updateProfilesYml, Snowflake block, plus DIFF-3
  profileKeysToRemove(conn: SnowflakeConnection): string[] {
    const keys =
      conn.authMethod === 'oauth_browser'
        ? ['password', 'client_store_temporary_credential']
        : ['authenticator', 'token', 'client_store_temporary_credential'];
    return conn.role ? keys : [...keys, 'role']; // DIFF-3
  }

  // CS parseProfilesYml (1782-1793)
  fromProfileOutput(devOutput: Record<string, any>): SnowflakeDBTConnection {
    return {
      type: 'snowflake',
      account: devOutput.account,
      username: devOutput.user,
      password: devOutput.password,
      database: devOutput.database,
      schema: devOutput.schema,
      warehouse: devOutput.warehouse,
      role: devOutput.role,
    };
  }

  // CS mapDBTConnectionToConnectionInput (1903-1916)
  toConnectionInput(
    dbtConnection: SnowflakeDBTConnection,
    connectionName: string,
  ): SnowflakeConnection {
    return {
      type: 'snowflake',
      name: connectionName,
      account: dbtConnection.account,
      warehouse: dbtConnection.warehouse,
      username: dbtConnection.username,
      password: dbtConnection.password || '',
      database: dbtConnection.database,
      schema: dbtConnection.schema,
      role: dbtConnection.role,
      client_session_keep_alive: dbtConnection.client_session_keep_alive,
    };
  }

  // CS generateJdbcUrl (1321-1327)
  toJdbcUrl(conn: SnowflakeConnection): string {
    let snowflakeUrl = `jdbc:snowflake://${this.rosettaRef(conn, 'account')}.snowflakecomputing.com/?warehouse=${this.rosettaRef(conn, 'warehouse')}&db=${this.rosettaRef(conn, 'dbname')}&schema=${this.rosettaRef(conn, 'schema')}`;
    if (conn.authMethod === 'oauth_browser') {
      snowflakeUrl += '&authenticator=oauth_authorization_code';
    }
    return snowflakeUrl;
  }

  // CS generateRosettaYml (1238-1246): OAuth never persists a password
  protected async mainConfExtras(
    conn: SnowflakeConnection,
  ): Promise<Record<string, unknown>> {
    return conn.authMethod === 'oauth_browser'
      ? {
          userName: this.rosettaRef(conn, 'user'),
          authenticator: 'oauth_authorization_code',
        }
      : {
          userName: this.rosettaRef(conn, 'user'),
          password: this.rosettaRef(conn, 'password'),
        };
  }

  // yamlPartialUpdate.updateMainConf: OAuth drops the password
  mainConfKeysToRemove(conn: SnowflakeConnection): string[] {
    return conn.authMethod === 'oauth_browser'
      ? ['password']
      : ['authenticator'];
  }

  // CS mapToRosettaConnection (1378-1412)
  protected rosettaCredentialRefs(
    conn: SnowflakeConnection,
  ): Pick<RosettaConnection, 'userName' | 'password'> {
    return conn.authMethod === 'oauth_browser'
      ? { userName: `db-user-${conn.name}` }
      : super.rosettaCredentialRefs(conn);
  }
}
