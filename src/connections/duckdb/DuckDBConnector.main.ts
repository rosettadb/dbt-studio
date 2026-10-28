import path from 'path';
import type { QueryResponseType, Table } from '../../types/backend';
import { ConnectionDbt } from '../core/ConnectionDbt.main';
import type { ProfileImportContext } from '../core/ConnectionDbt.main';
import type { QueryContext, TestResult } from '../core/Connection.main';
import type { AgentHintContext } from '../core/agentHints.main';
import {
  duckdbDescriptor,
  type DuckDBConnection,
  type DuckDBDBTConnection,
} from './duckdb.shared';
import { executeDuckDBQuery, testDuckDBConnection } from './duckdb.client.main';
import DuckDBExtractor from './duckdb.extractor.main';

export class DuckDBConnector extends ConnectionDbt<
  DuckDBConnection,
  DuckDBDBTConnection
> {
  readonly descriptor = duckdbDescriptor;

  readonly dbtAdapterType = 'duckdb';

  // CS validateConnection (1290-1293)
  async validate(conn: DuckDBConnection): Promise<void> {
    // DuckDB specific validations
    if (!conn.database_path) throw new Error('Database path is required');
  }

  // CS testConnection (906-907)
  test(conn: DuckDBConnection): Promise<TestResult> {
    return testDuckDBConnection(conn);
  }

  // CS executeSelectStatement (1102-1108)
  query(
    conn: DuckDBConnection,
    sql: string,
    ctx: QueryContext,
  ): Promise<QueryResponseType> {
    return executeDuckDBQuery(conn, sql, ctx.onCancelable);
  }

  // CS extractSchemaFromConnection (2354-2362): no connect/disconnect, as today
  async extractSchema(conn: DuckDBConnection): Promise<{ tables: Table[] }> {
    const extractor = new DuckDBExtractor({
      database_path: conn.database_path,
      schema: conn.schema,
    });
    const schema = await extractor.extractSchema();
    return schema;
  }

  // CS areConnectionConfigsEqual (223-228)
  sameTarget(a: DuckDBConnection, b: DuckDBConnection): boolean {
    return a.database_path === b.database_path && a.schema === b.schema;
  }

  // CS generateUniqueConnectionName (380-386)
  nameHint(conn: DuckDBConnection): string {
    // Extract filename from path if available
    const fileName = path.basename(conn.database_path, '.duckdb');
    return fileName || conn.name;
  }

  // sqlAgent.ts 67-70; identical in the three agents
  agentHint(_ctx: AgentHintContext): string {
    return '\n\n## Dialect Specifics\nYou are connected to DuckDB. Ensure all queries use DuckDB SQL syntax and functions.';
  }

  // CS mapToDbtConnection (1483-1489)
  toDbtConnection(conn: DuckDBConnection): DuckDBDBTConnection {
    return {
      type: 'duckdb',
      path: conn.database_path, // Map database_path to path for DBT connection
      database: conn.database,
      schema: conn.schema,
    };
  }

  // CS mapToDbtProfileOutput (1630-1636)
  async toProfileOutput(
    conn: DuckDBConnection,
  ): Promise<Record<string, unknown>> {
    return {
      type: 'duckdb',
      path: conn.database_path,
      schema: conn.schema,
      threads: 4,
    };
  }

  // CS parseProfilesYml (1832-1845), `profilesPath` -> `ctx.profilesPath`
  fromProfileOutput(
    devOutput: Record<string, any>,
    ctx: ProfileImportContext,
  ): DuckDBDBTConnection {
    // Convert relative path to absolute path relative to the project directory
    const projectDir = path.dirname(ctx.profilesPath);
    const absolutePath = path.isAbsolute(devOutput.path)
      ? devOutput.path
      : path.resolve(projectDir, devOutput.path);

    return {
      type: 'duckdb',
      path: absolutePath,
      database: absolutePath,
      schema: devOutput.schema || 'main',
    };
  }

  // CS mapDBTConnectionToConnectionInput (1964-1974)
  toConnectionInput(
    dbtConnection: DuckDBDBTConnection,
    connectionName: string,
  ): DuckDBConnection {
    return {
      type: 'duckdb',
      name: connectionName,
      database_path: dbtConnection.path,
      short_database_path:
        dbtConnection.path.split('/').pop() || dbtConnection.path,
      database: dbtConnection.database,
      schema: dbtConnection.schema,
    };
  }

  // CS generateJdbcUrl (1345-1347)
  toJdbcUrl(conn: DuckDBConnection): string {
    // DuckDB JDBC URL format
    return `jdbc:duckdb:${conn.database_path}`;
  }

  // DIFF-6: short_database_path || database_path (CS 1169 / updateMainConf)
  protected mainConfNames(conn: DuckDBConnection): {
    databaseName: string;
    schemaName: string;
  } {
    return {
      databaseName: path.parse(conn.short_database_path || conn.database_path)
        .name,
      schemaName: conn.schema,
    };
  }

  protected async mainConfExtras(): Promise<Record<string, unknown>> {
    return {};
  }

  // mapToRosettaConnection (CS 1380-1384)
  protected rosettaDatabaseName(conn: DuckDBConnection): string {
    return conn.database_path;
  }

  protected rosettaCredentialRefs(): Record<string, never> {
    return {};
  }

  // yamlPartialUpdate: types without credentials drop these keys
  mainConfKeysToRemove(): string[] {
    return ['userName', 'password', 'authenticator'];
  }
}
