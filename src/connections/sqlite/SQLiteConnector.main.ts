import path from 'path';
import type { QueryResponseType, Table } from '../../types/backend';
import { Connection } from '../core/Connection.main';
import type { QueryContext, TestResult } from '../core/Connection.main';
import { sqliteDescriptor, type SQLiteConnection } from './sqlite.shared';
import {
  executeSQLiteQuery,
  extractSQLiteSchema,
  testSQLiteConnection,
} from './sqlite.client.main';

export class SQLiteConnector extends Connection<SQLiteConnection> {
  readonly descriptor = sqliteDescriptor;

  // CS validateConnection (1294-1296)
  async validate(conn: SQLiteConnection): Promise<void> {
    if (!conn.database_path) throw new Error('Database path is required');
  }

  // CS testConnection (908-909)
  async test(conn: SQLiteConnection): Promise<TestResult> {
    return testSQLiteConnection(conn);
  }

  // CS executeSelectStatement (1109-1111): exactly two arguments, synchronous result
  async query(
    conn: SQLiteConnection,
    sql: string,
    _ctx: QueryContext,
  ): Promise<QueryResponseType> {
    return executeSQLiteQuery(conn, sql);
  }

  // CS extractSchemaFromConnection (2363-2365)
  async extractSchema(conn: SQLiteConnection): Promise<{ tables: Table[] }> {
    return { tables: extractSQLiteSchema(conn) };
  }

  // ProjectsService.extractSchema default branch
  async extractProjectSchema(conn: SQLiteConnection): Promise<Table[]> {
    throw new Error(`Unsupported connection type: "${conn.type}"`);
  }

  // CS areConnectionConfigsEqual (229-233)
  sameTarget(a: SQLiteConnection, b: SQLiteConnection): boolean {
    return a.database_path === b.database_path;
  }

  // CS generateUniqueConnectionName (387-395)
  nameHint(conn: SQLiteConnection): string {
    return (
      path.basename(conn.database_path, path.extname(conn.database_path)) ||
      conn.name
    );
  }
}
