import type { QueryResponseType, Table } from '../../types/backend';
import { ConnectionDbt } from '../core/ConnectionDbt.main';
import type { QueryContext, TestResult } from '../core/Connection.main';
import type { AgentHintContext } from '../core/agentHints.main';
import {
  redshiftDescriptor,
  type RedshiftConnection,
  type RedshiftDBTConnection,
} from './redshift.shared';
import {
  executeRedshiftQuery,
  testRedshiftConnection,
} from './redshift.client.main';
import RedshiftExtractor from './redshift.extractor.main';

export class RedshiftConnector extends ConnectionDbt<
  RedshiftConnection,
  RedshiftDBTConnection
> {
  readonly descriptor = redshiftDescriptor;

  readonly dbtAdapterType = 'redshift';

  // CS validateConnection, shared host/port block (1272-1277)
  async validate(conn: RedshiftConnection): Promise<void> {
    if (!conn.host) throw new Error('Host is required');
    if (!conn.port) throw new Error('Port is required');
  }

  // CS testConnection (923-924)
  test(conn: RedshiftConnection): Promise<TestResult> {
    return testRedshiftConnection(conn);
  }

  // CS executeSelectStatement (1112-1118)
  query(
    conn: RedshiftConnection,
    sql: string,
    ctx: QueryContext,
  ): Promise<QueryResponseType> {
    return executeRedshiftQuery(conn, sql, ctx.onCancelable);
  }

  // CS extractSchemaFromConnection (2258-2276), `rsConn` -> `conn`
  async extractSchema(conn: RedshiftConnection): Promise<{ tables: Table[] }> {
    const extractor = new RedshiftExtractor({
      user: conn.username,
      host: conn.host,
      database: conn.database,
      password: conn.password,
      port: conn.port,
      ssl: conn.ssl ?? true,
      sslrootcert: conn.sslrootcert,
    });
    try {
      await extractor.connect();
      const schema = await extractor.extractSchema();
      return schema;
    } finally {
      await extractor.disconnect();
    }
  }

  // CS areConnectionConfigsEqual (279-292)
  sameTarget(a: RedshiftConnection, b: RedshiftConnection): boolean {
    return (
      a.host === b.host &&
      a.port === b.port &&
      a.database === b.database &&
      a.username === b.username &&
      a.schema === b.schema
    );
  }

  // CS generateUniqueConnectionName (396-400)
  nameHint(conn: RedshiftConnection): string {
    return conn.database;
  }

  // sqlAgent.ts 84-87; identical in the three agents
  agentHint(_ctx: AgentHintContext): string {
    return '\n\n## Dialect Specifics\nYou are connected to Amazon Redshift. Ensure all queries use Redshift SQL syntax and functions.';
  }

  // CS mapToDbtConnection (1460-1471)
  toDbtConnection(conn: RedshiftConnection): RedshiftDBTConnection {
    return {
      type: 'redshift',
      username: `db-user-${conn.name}`,
      password: `db-password-${conn.name}`,
      database: conn.database,
      schema: conn.schema,
      host: conn.host,
      port: conn.port,
      ssl: conn.ssl,
      sslrootcert: conn.sslrootcert,
    };
  }

  // CS mapToDbtProfileOutput (1586-1606); envVar -> this.profileRef
  async toProfileOutput(
    conn: RedshiftConnection,
  ): Promise<Record<string, unknown>> {
    const redshiftProfile: any = {
      type: 'redshift',
      host: this.profileRef(conn, 'host'),
      port: this.profileRefInt(conn, 'port'),
      user: this.profileRef(conn, 'user'),
      password: this.profileRef(conn, 'password'),
      dbname: this.profileRef(conn, 'dbname'),
      schema: this.profileRef(conn, 'schema'),
      threads: 4,
    };

    // Add SSL configuration if enabled
    if (conn.ssl) {
      redshiftProfile.sslmode = 'require';
      if (conn.sslrootcert) {
        redshiftProfile.sslrootcert = conn.sslrootcert;
      }
    }

    return redshiftProfile;
  }

  // CS parseProfilesYml (1808-1820)
  fromProfileOutput(devOutput: Record<string, any>): RedshiftDBTConnection {
    return {
      type: 'redshift',
      host: devOutput.host,
      port: devOutput.port || 5439,
      username: devOutput.user,
      password: devOutput.password,
      database: devOutput.dbname,
      schema: devOutput.schema,
      ssl: devOutput.sslmode === 'require',
      sslrootcert: devOutput.sslrootcert,
    };
  }

  // CS mapDBTConnectionToConnectionInput (1936-1950)
  toConnectionInput(
    dbtConnection: RedshiftDBTConnection,
    connectionName: string,
  ): RedshiftConnection {
    return {
      type: 'redshift',
      name: connectionName,
      host: dbtConnection.host,
      port: dbtConnection.port,
      username: dbtConnection.username,
      password: dbtConnection.password,
      database: dbtConnection.database,
      schema: dbtConnection.schema,
      keepalives_idle: dbtConnection.keepalives_idle,
      ssl: dbtConnection.ssl,
      sslrootcert: dbtConnection.sslrootcert,
    };
  }

  // CS generateJdbcUrl (1328-1339); ev -> this.rosettaRef
  toJdbcUrl(conn: RedshiftConnection): string {
    let redshiftUrl = `jdbc:redshift://${this.rosettaRef(conn, 'host')}:${this.rosettaRef(conn, 'port')}/${this.rosettaRef(conn, 'dbname')}?currentSchema=${this.rosettaRef(conn, 'schema')}`;

    // Add SSL parameters if enabled
    if (conn.ssl) {
      redshiftUrl += '&ssl=true';
      if (conn.sslrootcert) {
        redshiftUrl += `&sslrootcert=${conn.sslrootcert}`;
      }
    }
    return redshiftUrl;
  }
}
