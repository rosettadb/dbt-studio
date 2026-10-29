import type { QueryResponseType, Table } from '../../types/backend';
import { Connection } from '../core/Connection.main';
import type { QueryContext, TestResult } from '../core/Connection.main';
import { mysqlDescriptor, type MySqlConnection } from './mysql.shared';
import { executeMySqlQuery, testMySqlConnection } from './mysql.client.main';
import MySqlExtractor from './mysql.extractor.main';

/**
 * Query-only today (D19): no JDBC URL or dbt members. For reference, today's
 * unused URL is `jdbc:mysql://${host}:${port}/${dbname}?useSSL=${ssl}&serverTimezone=UTC&useUnicode=true&characterEncoding=UTF-8`.
 */
export class MySqlConnector extends Connection<MySqlConnection> {
  readonly descriptor = mysqlDescriptor;

  // CS validateConnection, shared host/port block (1272-1277)
  async validate(conn: MySqlConnection): Promise<void> {
    if (!conn.host) throw new Error('Host is required');
    if (!conn.port) throw new Error('Port is required');
  }

  // CS testConnection (932-933)
  test(conn: MySqlConnection): Promise<TestResult> {
    return testMySqlConnection(conn);
  }

  // CS executeSelectStatement (1132-1134)
  query(
    conn: MySqlConnection,
    sql: string,
    ctx: QueryContext,
  ): Promise<QueryResponseType> {
    return executeMySqlQuery(conn, sql, ctx.onCancelable);
  }

  // CS extractSchemaFromConnection (2388-2405), `myConn` -> `conn`
  async extractSchema(conn: MySqlConnection): Promise<{ tables: Table[] }> {
    const extractor = new MySqlExtractor({
      user: conn.username,
      host: conn.host,
      database: conn.database,
      password: conn.password,
      port: conn.port,
      ssl: conn.ssl,
    });
    try {
      await extractor.connect();
      const schema = await extractor.extractSchema();
      return schema;
    } finally {
      await extractor.disconnect();
    }
  }

  // CS areConnectionConfigsEqual (341-353)
  sameTarget(a: MySqlConnection, b: MySqlConnection): boolean {
    return (
      a.host === b.host &&
      a.port === b.port &&
      a.database === b.database &&
      a.username === b.username &&
      a.schema === b.schema &&
      a.ssl === b.ssl
    );
  }

  // CS generateUniqueConnectionName
  nameHint(conn: MySqlConnection): string {
    return conn.database;
  }
}
