import type { QueryResponseType, Table } from '../../types/backend';
import { ConnectionDbt } from '../core/ConnectionDbt.main';
import type { QueryContext, TestResult } from '../core/Connection.main';
import type { AgentHintContext } from '../core/agentHints.main';
import {
  postgresDescriptor,
  type PostgresConnection,
  type PostgresDBTConnection,
} from './postgres.shared';
import {
  executePostgresQuery,
  testPostgresConnection,
} from './postgres.client.main';
import PGSchemaExtractor from './postgres.extractor.main';

export class PostgresConnector extends ConnectionDbt<
  PostgresConnection,
  PostgresDBTConnection
> {
  readonly descriptor = postgresDescriptor;

  readonly dbtAdapterType = 'postgres';

  // CS validateConnection, case 'postgres' (1272-1277: shared host/port block)
  async validate(conn: PostgresConnection): Promise<void> {
    if (!conn.host) throw new Error('Host is required');
    if (!conn.port) throw new Error('Port is required');
  }

  // CS testConnection, case 'postgres' (894-895)
  test(conn: PostgresConnection): Promise<TestResult> {
    return testPostgresConnection(conn);
  }

  // CS executeSelectStatement, case 'postgres' (1077-1083)
  query(
    conn: PostgresConnection,
    sql: string,
    ctx: QueryContext,
  ): Promise<QueryResponseType> {
    return executePostgresQuery(conn, sql, ctx.onCancelable);
  }

  // CS extractSchemaFromConnection, case 'postgres' (2239-2257), `pgConn` -> `conn`
  async extractSchema(conn: PostgresConnection): Promise<{ tables: Table[] }> {
    const extractor = new PGSchemaExtractor({
      user: conn.username,
      host: conn.host,
      database: conn.database,
      password: conn.password,
      port: conn.port,
      ssl: conn.ssl,
      sslRejectUnauthorized: conn.sslRejectUnauthorized,
    });
    try {
      await extractor.connect();
      const schema = await extractor.extractSchema();
      return schema;
    } finally {
      await extractor.disconnect();
    }
  }

  // CS areConnectionConfigsEqual, case 'postgres' (239-252)
  sameTarget(a: PostgresConnection, b: PostgresConnection): boolean {
    return (
      a.host === b.host &&
      a.port === b.port &&
      a.database === b.database &&
      a.username === b.username &&
      a.schema === b.schema
    );
  }

  // CS generateUniqueConnectionName (396-400)
  nameHint(conn: PostgresConnection): string {
    return conn.database;
  }

  // sqlAgent.ts 71-75; identical in the three agents
  agentHint(_ctx: AgentHintContext): string {
    return '\n\n## Dialect Specifics\nYou are connected to PostgreSQL. Ensure all queries use PostgreSQL SQL syntax and functions.';
  }

  // CS mapToDbtConnection, case 'postgres' (1449-1459)
  toDbtConnection(conn: PostgresConnection): PostgresDBTConnection {
    return {
      type: 'postgres',
      username: `db-user-${conn.name}`,
      password: `db-password-${conn.name}`,
      database: conn.database,
      schema: conn.schema,
      host: conn.host,
      port: conn.port,
      ssl: conn.ssl,
    };
  }

  // CS mapToDbtProfileOutput, case 'postgres' (1550-1561)
  async toProfileOutput(
    conn: PostgresConnection,
  ): Promise<Record<string, unknown>> {
    return {
      type: 'postgres',
      host: this.profileRef(conn, 'host'),
      port: this.profileRefInt(conn, 'port'),
      user: this.profileRef(conn, 'user'),
      password: this.profileRef(conn, 'password'),
      dbname: this.profileRef(conn, 'dbname'),
      schema: this.profileRef(conn, 'schema'),
      threads: 4,
      ...(conn.ssl && { sslmode: 'require' }),
    };
  }

  // CS parseProfilesYml, case 'postgres' (1771-1781)
  fromProfileOutput(devOutput: Record<string, any>): PostgresDBTConnection {
    return {
      type: 'postgres',
      host: devOutput.host,
      port: devOutput.port || 5432,
      username: devOutput.user,
      password: devOutput.password,
      database: devOutput.dbname,
      schema: devOutput.schema,
    };
  }

  // CS mapDBTConnectionToConnectionInput, case 'postgres' (1890-1902)
  toConnectionInput(
    dbtConnection: PostgresDBTConnection,
    connectionName: string,
  ): PostgresConnection {
    return {
      type: 'postgres',
      name: connectionName,
      host: dbtConnection.host,
      port: dbtConnection.port,
      username: dbtConnection.username,
      password: dbtConnection.password,
      database: dbtConnection.database,
      schema: dbtConnection.schema,
      keepalives_idle: dbtConnection.keepalives_idle,
    };
  }

  // CS generateJdbcUrl, case 'postgres' (1314-1320)
  toJdbcUrl(conn: PostgresConnection): string {
    let postgresUrl = `jdbc:postgresql://${this.rosettaRef(conn, 'host')}:${this.rosettaRef(conn, 'port')}/${this.rosettaRef(conn, 'dbname')}?currentSchema=${this.rosettaRef(conn, 'schema')}`;
    if (conn.ssl) {
      postgresUrl += '&sslmode=require';
    }
    return postgresUrl;
  }
}
