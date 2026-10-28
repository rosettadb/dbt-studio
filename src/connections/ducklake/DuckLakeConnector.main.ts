import SecureStorageService from '../../main/services/secureStorage.service';
import DuckLakeService from '../../main/services/duckLake.service';
import DuckLakeInstanceStore from '../../main/services/duckLake/instanceStore.service';
import type { QueryResponseType, Table } from '../../types/backend';
import { ConnectionDbt } from '../core/ConnectionDbt.main';
import type { QueryContext, TestResult } from '../core/Connection.main';
import type { AgentHintContext } from '../core/agentHints.main';
import type { DuckDBDBTConnection } from '../duckdb/duckdb.shared';
import {
  ducklakeDescriptor,
  type DuckLakeConnectionConfig,
} from './ducklake.shared';

export class DuckLakeConnector extends ConnectionDbt<
  DuckLakeConnectionConfig,
  DuckDBDBTConnection
> {
  readonly descriptor = ducklakeDescriptor;

  // DuckLake profiles import as DuckDB, as today.
  readonly dbtAdapterType = undefined;

  readonly supportsPartialUpdate = false;

  // CS validateConnection, case 'ducklake' (1297-1301)
  async validate(conn: DuckLakeConnectionConfig): Promise<void> {
    if (!conn.instanceId) throw new Error('DuckLake instance ID is required');
  }

  // CS testConnection, case 'ducklake' (910-922)
  // eslint-disable-next-line class-methods-use-this
  async test(conn: DuckLakeConnectionConfig): Promise<TestResult> {
    // DuckLake connection test - validate instance exists
    try {
      const instance = await DuckLakeService.getInstance(conn.instanceId);
      if (!instance || !instance.id) {
        return false;
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  // CS executeSelectStatement, case 'ducklake' (1119-1124)
  // eslint-disable-next-line class-methods-use-this
  async query(
    _conn: DuckLakeConnectionConfig,
    _sql: string,
    _ctx: QueryContext,
  ): Promise<QueryResponseType> {
    return {
      success: false,
      error: 'DuckLake query execution not yet implemented',
    } as QueryResponseType;
  }

  // CS extractSchemaFromConnection, case 'ducklake' (2366-2368)
  // eslint-disable-next-line class-methods-use-this
  async extractSchema(): Promise<{ tables: Table[] }> {
    return { tables: [] };
  }

  // projects.service.ts extractSchema, case 'ducklake' (1306-1308)
  // eslint-disable-next-line class-methods-use-this
  async extractProjectSchema(): Promise<Table[]> {
    throw new Error(
      'Schema extraction is not supported for DuckLake connections. DuckLake projects use dynamic data lake catalogs.',
    );
  }

  // CS areConnectionConfigsEqual, case 'ducklake' (234-238)
  // eslint-disable-next-line class-methods-use-this
  sameTarget(
    a: DuckLakeConnectionConfig,
    b: DuckLakeConnectionConfig,
  ): boolean {
    return a.instanceId === b.instanceId;
  }

  // No case in generateUniqueConnectionName: the default applies.
  // eslint-disable-next-line class-methods-use-this
  nameHint(): string {
    return 'DBT Connection';
  }

  // sqlAgent.ts 56-66; identical in the three agents
  // eslint-disable-next-line class-methods-use-this
  agentHint(ctx: AgentHintContext): string {
    return `\n\n## DuckLake Specifics
You are connected to a DuckLake lakehouse. DuckLake is a DuckDB extension (not a separate library).
- Versions: DuckDB v${ctx.duckdbVersion}, DuckLake extension minimal v${ctx.ducklakeVersion}.
- Dialect: Use DuckDB SQL dialect and functions.
- Attach: \`ATTACH 'ducklake:my.ducklake' AS my_ducklake; USE my_ducklake;\`
- Time Travel: \`SELECT ... FROM tbl AT (VERSION => 2)\` or \`AT (TIMESTAMP => '2025-01-01')\`
- Snapshots: \`FROM my_ducklake.snapshots();\`
- Constraints: No indexes, primary keys, foreign keys, UNIQUE or CHECK constraints.
- Updates: Modeled as deletes followed by inserts (append-only Parquet storage).
- Detach: \`USE memory; DETACH my_ducklake;\``;
  }

  // CS mapToDbtConnection, case 'ducklake' (1490-1497)
  // eslint-disable-next-line class-methods-use-this
  toDbtConnection(): DuckDBDBTConnection {
    // DuckLake uses DuckDB type for DBT
    return {
      type: 'duckdb',
      path: ':memory:', // In-memory DuckDB
      database: 'dl',
      schema: 'main',
    } as DuckDBDBTConnection;
  }

  // CS mapToDbtProfileOutput, case 'ducklake' (1637-1686)
  async toProfileOutput(
    conn: DuckLakeConnectionConfig,
  ): Promise<Record<string, unknown>> {
    // For ducklake, we need to generate a DuckDB profile with ducklake extension
    const instance = await DuckLakeService.getInstance(conn.instanceId);

    const credentials = await DuckLakeInstanceStore.retrieveCredentials(
      instance.id,
      instance.catalog as any,
      instance.storage as any,
    );

    let metadataPath = '';
    if (
      instance.catalog.type === 'duckdb' &&
      instance.catalog.duckdb?.metadataPath
    ) {
      metadataPath = instance.catalog.duckdb.metadataPath;
    } else if (
      instance.catalog.type === 'sqlite' &&
      instance.catalog.sqlite?.metadataPath
    ) {
      metadataPath = instance.catalog.sqlite.metadataPath;
    }

    const duckLakeProfile: any = {
      type: 'duckdb',
      threads: 4,
      extensions: ['httpfs', 'ducklake'],
      attach: [
        {
          path: `ducklake:${metadataPath}`,
          alias: 'dl',
          options: {
            data_path: instance.dataPath,
          },
        },
      ],
      database: 'dl',
    };

    // Add S3 settings if storage is S3 - use env vars for security
    if (credentials.storage?.type === 's3' && credentials.storage.s3) {
      duckLakeProfile.settings = {
        s3_region: `{{ env_var("db-s3-region-${conn.name}") }}`,
        s3_access_key_id: `{{ env_var("db-s3-access-key-${conn.name}") }}`,
        s3_secret_access_key: `{{ env_var("db-s3-secret-key-${conn.name}") }}`,
      };
    }

    return duckLakeProfile;
  }

  // CS generateJdbcUrl, case 'ducklake' (1348-1350): in-memory DuckDB session
  // eslint-disable-next-line class-methods-use-this
  toJdbcUrl(): string {
    return `jdbc:duckdb:`;
  }

  // CS generateRosettaYml (1171-1173): project name as database name
  protected mainConfNames(
    _conn: DuckLakeConnectionConfig,
    projectName: string,
  ): { databaseName: string; schemaName: string } {
    return { databaseName: projectName, schemaName: 'main' };
  }

  // CS generateRosettaYml (1195-1227), building a fresh object
  protected async mainConfExtras(
    conn: DuckLakeConnectionConfig,
  ): Promise<Record<string, unknown>> {
    const extras: Record<string, unknown> = {};
    const instance = await DuckLakeService.getInstance(conn.instanceId);

    // Get credentials if available
    const credentials = await DuckLakeInstanceStore.retrieveCredentials(
      instance.id,
      instance.catalog as any,
      instance.storage as any,
    );

    extras.ducklakeDataPath = instance.dataPath;

    // Metadata DB path (from catalog config)
    if (
      instance.catalog.type === 'duckdb' &&
      instance.catalog.duckdb?.metadataPath
    ) {
      extras.ducklakeMetadataDb = instance.catalog.duckdb.metadataPath;
    } else if (
      instance.catalog.type === 'sqlite' &&
      instance.catalog.sqlite?.metadataPath
    ) {
      extras.ducklakeMetadataDb = instance.catalog.sqlite.metadataPath;
    }

    // Add S3 credentials if storage is S3 - use env vars for security
    if (credentials.storage?.type === 's3' && credentials.storage.s3) {
      extras.s3Region = this.rosettaRef(conn, 's3-region');
      extras.s3AccessKeyId = this.rosettaRef(conn, 's3-access-key');
      extras.s3SecretAccessKey = this.rosettaRef(conn, 's3-secret-key');
    }
    return extras;
  }

  // CS mapToRosettaConnection (1393-1398)
  protected rosettaDatabaseName(): string {
    return '';
  }

  protected rosettaSchemaName(): string {
    return '';
  }

  // CS saveNewConnection S3 block (465-494)
  // eslint-disable-next-line class-methods-use-this
  async onSave(conn: DuckLakeConnectionConfig): Promise<void> {
    const instance = await DuckLakeService.getInstance(conn.instanceId);
    const credentials = await DuckLakeInstanceStore.retrieveCredentials(
      instance.id,
      instance.catalog as any,
      instance.storage as any,
    );

    // Store S3 credentials in secure storage if they exist
    if (credentials.storage?.type === 's3' && credentials.storage.s3) {
      await SecureStorageService.setCredential(
        `db-s3-region-${conn.name}`,
        credentials.storage.s3.region,
      );
      await SecureStorageService.setCredential(
        `db-s3-access-key-${conn.name}`,
        credentials.storage.s3.accessKeyId,
      );
      await SecureStorageService.setCredential(
        `db-s3-secret-key-${conn.name}`,
        credentials.storage.s3.secretAccessKey,
      );
      if (credentials.storage.s3.sessionToken) {
        await SecureStorageService.setCredential(
          `db-s3-session-token-${conn.name}`,
          credentials.storage.s3.sessionToken,
        );
      }
    }
  }

  // CS loadConfigurations DuckLake block (557-586)
  // eslint-disable-next-line class-methods-use-this
  async prepareProjectEnv(conn: DuckLakeConnectionConfig): Promise<void> {
    const s3Region = await SecureStorageService.getCredential(
      `db-s3-region-${conn.name}`,
    );
    const s3AccessKey = await SecureStorageService.getCredential(
      `db-s3-access-key-${conn.name}`,
    );
    const s3SecretKey = await SecureStorageService.getCredential(
      `db-s3-secret-key-${conn.name}`,
    );
    const s3SessionToken = await SecureStorageService.getCredential(
      `db-s3-session-token-${conn.name}`,
    );

    if (s3Region) {
      process.env[`db-s3-region-${conn.name}`] = s3Region;
    }
    if (s3AccessKey) {
      process.env[`db-s3-access-key-${conn.name}`] = s3AccessKey;
    }
    if (s3SecretKey) {
      process.env[`db-s3-secret-key-${conn.name}`] = s3SecretKey;
    }
    if (s3SessionToken) {
      process.env[`db-s3-session-token-${conn.name}`] = s3SessionToken;
    }
  }
}
