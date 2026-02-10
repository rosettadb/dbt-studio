/**
 * Base Catalog Adapter Interface
 * Defines the contract for all catalog-specific implementations
 */

import { DuckDBInstance } from '@duckdb/node-api';
import {
  DuckLakeCatalogConfig,
  DuckLakeInstance,
  DuckLakeTableInfo,
  DuckLakeSnapshotInfo,
  DuckLakeSnapshotDetail,
  DuckLakeQueryResult,
  DuckLakeQueryRequest,
  DuckLakeStorageConfig,
  DuckLakeSnapshotParams,
  DuckLakePaginatedResult,
} from '../../../../types/duckLake';
import { generateGCSBearerToken } from '../../../helpers/cloudAuth.helper';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface HealthStatus {
  connected: boolean;
  lastChecked: Date;
  responseTime?: number;
  error?: string;
}

export interface ConnectionInfo {
  instance: any; // DuckDBInstance
  connection: any; // DuckDBConnection
  catalogType: string;
  instanceName: string; // DuckLake instance name for DETACH
  connectedAt: Date;
}

/**
 * Base abstract class for catalog adapters
 * Each catalog type (DuckDB, SQLite, PostgreSQL) extends this
 */
export abstract class CatalogAdapter {
  protected connectionInfo: ConnectionInfo | null = null;

  /**
   * Connect to the catalog database and attach DuckLake
   */
  abstract connect(
    config: DuckLakeCatalogConfig,
    instance: DuckLakeInstance,
    storageConfig?: DuckLakeStorageConfig,
  ): Promise<ConnectionInfo>;

  /**
   * Disconnect from the catalog database
   */
  abstract disconnect(): Promise<void>;

  /**
   * Validate catalog configuration before connection
   */
  abstract validateConfig(
    config: DuckLakeCatalogConfig,
  ): Promise<ValidationResult>;

  /**
   * Test connection without full setup
   */
  abstract testConnection(config: DuckLakeCatalogConfig): Promise<HealthStatus>;

  /**
   * Perform health check on existing connection
   */
  abstract healthCheck(): Promise<HealthStatus>;

  /**
   * List tables in the DuckLake instance
   */
  abstract listTables(): Promise<DuckLakeTableInfo[]>;

  /**
   * Get table metadata
   */
  abstract getTable(tableName: string): Promise<DuckLakeTableInfo>;

  abstract deleteTable(tableName: string): Promise<void>;

  abstract renameTable(oldName: string, newName: string): Promise<void>;

  abstract addColumn(
    tableName: string,
    columnName: string,
    columnType: string,
    defaultValue?: string,
  ): Promise<void>;

  abstract dropColumn(tableName: string, columnName: string): Promise<void>;

  abstract renameColumn(
    tableName: string,
    oldColumnName: string,
    newColumnName: string,
  ): Promise<void>;

  abstract alterColumnType(
    tableName: string,
    columnName: string,
    newType: string,
  ): Promise<void>;

  abstract setPartitionedBy(
    tableName: string,
    columnNames: string[],
  ): Promise<void>;

  abstract restoreSnapshot(
    tableName: string,
    snapshotId: number,
  ): Promise<void>;

  abstract updateRows(
    tableName: string,
    updateQuery: string,
  ): Promise<{ rowsAffected: number }>;

  abstract deleteRows(
    tableName: string,
    deleteQuery: string,
  ): Promise<{ rowsAffected: number }>;

  abstract upsertRows(
    tableName: string,
    upsertQuery: string,
  ): Promise<{ rowsAffected: number }>;

  /**
   * Execute query against the DuckLake instance
   */
  abstract executeQuery(
    request: DuckLakeQueryRequest,
  ): Promise<DuckLakeQueryResult>;

  /**
   * List snapshots for a table
   */
  abstract listSnapshots(tableName: string): Promise<DuckLakeSnapshotInfo[]>;

  /**
   * Get all snapshots for the entire instance (not table-specific)
   * Used for instance-wide history view with pagination
   */
  abstract listInstanceSnapshots(
    params: DuckLakeSnapshotParams,
  ): Promise<DuckLakePaginatedResult<DuckLakeSnapshotDetail>>;

  /**
   * Get comprehensive table details from DuckLake metadata catalog (Phase 8b)
   * Queries multiple metadata tables to provide complete table information
   */
  abstract getTableDetails(tableName: string): Promise<any>; // Returns DuckLakeTableDetails

  /**
   * Get current connection info
   */
  getConnectionInfo(): ConnectionInfo | null {
    return this.connectionInfo;
  }

  /**
   * Check if adapter is connected
   */
  isConnected(): boolean {
    return this.connectionInfo !== null;
  }

  /**
   * Get catalog type identifier
   */
  abstract getCatalogType(): string;

  /**
   * Initialize DuckDB instance with common settings
   */
  // eslint-disable-next-line class-methods-use-this
  protected async initializeDuckDB(
    runtimeOptions?: DuckLakeInstance['runtimeOptions'],
  ): Promise<any> {
    try {
      // Create DuckDB instance with runtime options
      const config: Record<string, string> = {};

      if (runtimeOptions?.maxMemory) {
        config.memory_limit = runtimeOptions.maxMemory;
      }

      if (runtimeOptions?.threads) {
        config.threads = runtimeOptions.threads.toString();
      }

      if (runtimeOptions?.tempDirectory) {
        config.temp_directory = runtimeOptions.tempDirectory;
      }

      const instance = await DuckDBInstance.create(':memory:', config);
      return instance;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to initialize DuckDB instance:', error);
      throw error;
    }
  }

  /**
   * Load DuckLake extension
   */
  // eslint-disable-next-line class-methods-use-this
  protected async loadDuckLakeExtension(connection: any): Promise<void> {
    try {
      // Install and load DuckLake extension
      await connection.run('INSTALL ducklake');
      await connection.run('LOAD ducklake');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load DuckLake extension:', error);
      throw error;
    }
  }

  /**
   * Load additional extensions based on catalog type
   */
  // eslint-disable-next-line class-methods-use-this
  protected async loadCatalogExtensions(
    connection: any,
    extensions: string[],
  ): Promise<void> {
    try {
      // Load extensions sequentially to avoid conflicts
      await extensions.reduce(async (previousPromise, extension) => {
        await previousPromise;
        await connection.run(`INSTALL ${extension}`);
        await connection.run(`LOAD ${extension}`);
      }, Promise.resolve());
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `Failed to load catalog extensions: ${extensions.join(', ')}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Execute ATTACH command for DuckLake catalog
   */
  // eslint-disable-next-line class-methods-use-this
  protected async attachDuckLakeCatalog(
    connection: any,
    attachString: string,
    instanceName: string,
    dataPath: string,
  ): Promise<void> {
    try {
      const escapedInstanceName = instanceName.replace(/"/g, '""');
      const attachQuery = `ATTACH '${attachString}' AS "${escapedInstanceName}" (DATA_PATH '${dataPath.replace(/'/g, "''")}')`;
      await connection.run(attachQuery);

      // Switch to the attached DuckLake catalog
      await connection.run(`USE "${escapedInstanceName}"`);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to attach DuckLake catalog:', error);
      throw error;
    }
  }

  /**
   * Execute DETACH command for DuckLake catalog
   * This properly frees memory by detaching the DuckLake instance
   */
  // eslint-disable-next-line class-methods-use-this
  protected async detachDuckLakeCatalog(
    connection: any,
    instanceName: string,
  ): Promise<void> {
    try {
      const escapedInstanceName = instanceName.replace(/"/g, '""');

      // Switch to memory database first (can't detach current database)
      await connection.run('USE memory');

      // Execute DETACH to properly free memory
      const detachQuery = `DETACH "${escapedInstanceName}"`;
      await connection.run(detachQuery);

      // eslint-disable-next-line no-console
      console.log(`Successfully detached DuckLake instance: ${instanceName}`);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to detach DuckLake catalog:', error);
      // Don't throw - we still want to clean up even if detach fails
    }
  }

  /**
   * Common cleanup for connections
   * Now properly executes DETACH before cleanup to free memory
   */
  protected async cleanup(): Promise<void> {
    if (this.connectionInfo) {
      try {
        // Execute DETACH command to properly free memory
        if (
          this.connectionInfo.instanceName &&
          this.connectionInfo.connection
        ) {
          await this.detachDuckLakeCatalog(
            this.connectionInfo.connection,
            this.connectionInfo.instanceName,
          );
        }

        // Explicitly close the connection to release memory
        if (this.connectionInfo.connection) {
          try {
            this.connectionInfo.connection.closeSync();
            // eslint-disable-next-line no-console
            console.log(
              `[DuckDB] Closed connection for instance: ${this.connectionInfo.instanceName}`,
            );
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Error closing connection:', error);
          }
        }

        // Close the DuckDB instance if it has a close method
        if (
          this.connectionInfo.instance &&
          typeof this.connectionInfo.instance.close === 'function'
        ) {
          try {
            await this.connectionInfo.instance.close();
            // eslint-disable-next-line no-console
            console.log(
              `[DuckDB] Closed instance: ${this.connectionInfo.instanceName}`,
            );
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Error closing instance:', error);
          }
        }

        this.connectionInfo = null;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error during connection cleanup:', error);
      }
    }
  }

  /**
   * Create DuckDB secrets for cloud storage access
   */
  // eslint-disable-next-line class-methods-use-this
  protected async createSecrets(
    connection: any,
    storageConfig?: DuckLakeStorageConfig,
  ): Promise<void> {
    if (!storageConfig) {
      return;
    }

    try {
      // eslint-disable-next-line no-console
      console.debug('[DuckLake][createSecrets] Received storage config', {
        type: storageConfig.type,
        hasS3: Boolean(storageConfig.s3),
        hasAzure: Boolean(storageConfig.azure),
        hasGcsCredentials: Boolean(storageConfig.gcs?.credentials),
        bucket: storageConfig.gcs?.bucket,
        projectId: storageConfig.gcs?.projectId,
      });

      if (storageConfig.type === 's3' && storageConfig.s3) {
        // eslint-disable-next-line no-console
        console.debug(
          '[DuckLake][createSecrets] Creating S3 secret for httpfs',
          {
            region: storageConfig.s3.region,
            endpoint: storageConfig.s3.endpoint,
          },
        );
        const { region, accessKeyId, secretAccessKey, endpoint } =
          storageConfig.s3;
        const secretName = `s3_secret_${Date.now()}`;

        let secretQuery = `CREATE OR REPLACE SECRET ${secretName} (
  TYPE s3,
  PROVIDER config,
  KEY_ID '${accessKeyId}',
  SECRET '${secretAccessKey}',
  REGION '${region}'`;

        if (endpoint) {
          secretQuery += `,
  ENDPOINT '${endpoint}'`;
        }

        secretQuery += `
);`;
        await connection.run(secretQuery);
        // eslint-disable-next-line no-console
        console.debug('[DuckLake][createSecrets] S3 secret created');
      } else if (storageConfig.type === 'azure' && storageConfig.azure) {
        // eslint-disable-next-line no-console
        console.debug('[DuckLake][createSecrets] Creating Azure secret');
        const { connectionString, accountName, accountKey } =
          storageConfig.azure;
        const secretName = `azure_secret_${Date.now()}`;

        if (connectionString) {
          await connection.run(`
            CREATE OR REPLACE SECRET ${secretName} (
              TYPE AZURE,
              CONNECTION_STRING '${connectionString}'
            );
          `);
        } else if (accountName && accountKey) {
          const builtConnectionString = `DefaultEndpointsProtocol=https;AccountName=${accountName};AccountKey=${accountKey};EndpointSuffix=core.windows.net`;
          await connection.run(`
            CREATE OR REPLACE SECRET ${secretName} (
              TYPE AZURE,
              CONNECTION_STRING '${builtConnectionString}'
            );
          `);
        } else if (accountName) {
          await connection.run(`
            CREATE OR REPLACE SECRET ${secretName} (
              TYPE AZURE,
              PROVIDER config,
              ACCOUNT_NAME '${accountName}'
            );
          `);
        } else {
          // eslint-disable-next-line no-console
          console.warn(
            '[DuckLake][createSecrets] Azure credentials missing, secret not created',
          );
        }
        // eslint-disable-next-line no-console
        console.debug('[DuckLake][createSecrets] Azure secret created');
      } else if (storageConfig.type === 'gcs' && storageConfig.gcs) {
        // eslint-disable-next-line no-console
        console.debug('[DuckLake][createSecrets] Creating GCS secret');
        const { credentials } = storageConfig.gcs;
        const secretName = `gcs_secret_${Date.now()}`;

        if (credentials) {
          try {
            // Generate short-lived bearer token from service account JSON
            const token = await generateGCSBearerToken(credentials);
            const escapedToken = token.replace(/'/g, "''");

            await connection.run(`
CREATE OR REPLACE SECRET ${secretName} (
  TYPE http,
  EXTRA_HTTP_HEADERS MAP {'Authorization': 'Bearer ${escapedToken}'}
);`);
            // eslint-disable-next-line no-console
            console.debug(
              '[DuckLake][createSecrets] GCS secret created with bearer token',
              {
                hasCredentials: true,
                credentialLength: credentials.length,
              },
            );
          } catch (tokenError) {
            // eslint-disable-next-line no-console
            console.error(
              '[DuckLake][createSecrets] Failed to generate GCS bearer token',
              tokenError,
            );
            throw tokenError;
          }
        } else {
          // eslint-disable-next-line no-console
          console.warn(
            '[DuckLake][createSecrets] GCS credentials missing, secret not created',
          );
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        '[DuckLake][createSecrets] Failed to create cloud storage secrets',
        {
          type: storageConfig.type,
          hasS3: Boolean(storageConfig.s3),
          hasAzure: Boolean(storageConfig.azure),
          hasGcsCredentials: Boolean(storageConfig.gcs?.credentials),
        },
        error,
      );
      throw error;
    }
  }

  /**
   * Resolve the attached DuckLake metadata database name
   */
  protected async getMetadataDatabaseName(): Promise<string> {
    if (!this.connectionInfo) {
      throw new Error('Not connected to catalog');
    }

    const databasesQuery = `
      SELECT database_name
      FROM duckdb_databases()
      WHERE database_name LIKE '__ducklake_metadata_%'
      LIMIT 1
    `;

    const databasesResult =
      await this.connectionInfo.connection.run(databasesQuery);
    const databaseRows = await databasesResult.getRows();

    if (databaseRows.length === 0) {
      throw new Error('DuckLake metadata database not found');
    }

    return Array.isArray(databaseRows[0])
      ? databaseRows[0][0]
      : (databaseRows[0] as any).database_name;
  }

  /**
   * Sanitize default value for SQL injection protection
   * Validates and escapes default values to prevent SQL injection
   */
  // eslint-disable-next-line class-methods-use-this
  protected sanitizeDefaultValue(defaultValue: string): string {
    const trimmedValue = defaultValue.trim();

    // Check for dangerous SQL injection markers that shouldn't appear even in strings if we are being very strict,
    // although standard SQL string escaping should handle them.
    // We kept these minimal checks to avoid obvious injection attempts in what should be a simple value.
    if (
      trimmedValue.includes(';') ||
      trimmedValue.includes('--') ||
      trimmedValue.includes('/*') ||
      trimmedValue.includes('*/')
    ) {
      throw new Error(
        'Invalid default value: contains potentially dangerous SQL patterns',
      );
    }

    // Check if it's a simple literal (number, boolean, NULL) or standard SQL function
    // This allows unquoted values for these specific safe types/keywords
    const simpleLiteralPattern =
      /^(NULL|TRUE|FALSE|-?\d+(\.\d+)?|CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME)$/i;

    if (simpleLiteralPattern.test(trimmedValue)) {
      return trimmedValue;
    }

    // Treat everything else as a string literal: escape single quotes and wrap in quotes
    // This safely handles values that might contain keywords like "CREATE" or "DROP"
    // e.g. default value "CREATE_DATE" becomes "'CREATE_DATE'"
    const escapedValue = trimmedValue.replace(/'/g, "''");
    return `'${escapedValue}'`;
  }

  /**
   * Validate column type to prevent SQL injection
   * Checks type against allowlist of valid DuckDB/PostgreSQL/SQLite types
   */
  // eslint-disable-next-line class-methods-use-this
  protected validateColumnType(columnType: string): string {
    const trimmedType = columnType.trim();

    // Check for dangerous SQL patterns
    if (
      trimmedType.includes(';') ||
      trimmedType.includes('--') ||
      trimmedType.includes('/*') ||
      trimmedType.includes('*/') ||
      trimmedType.toLowerCase().includes('drop') ||
      trimmedType.toLowerCase().includes('delete') ||
      trimmedType.toLowerCase().includes('insert') ||
      trimmedType.toLowerCase().includes('update') ||
      trimmedType.toLowerCase().includes('create') ||
      trimmedType.toLowerCase().includes('alter')
    ) {
      throw new Error(
        'Invalid column type: contains potentially dangerous SQL patterns',
      );
    }

    // Comprehensive regex for DuckDB/PostgreSQL/SQLite types
    // Supports: basic types, sized types, precision types, arrays, structs, maps, etc.
    const typePattern =
      /^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT|INT|DOUBLE\s+PRECISION|DOUBLE|REAL|FLOAT|DECIMAL(\(\d+(\s*,\s*\d+)?\))?|NUMERIC(\(\d+(\s*,\s*\d+)?\))?|VARCHAR(\(\d+\))?|CHAR(\(\d+\))?|TEXT|STRING|BLOB|BYTEA|BOOLEAN|BOOL|DATE|TIME|TIMESTAMP|TIMESTAMPTZ|TIMESTAMP\s+WITH\s+TIME\s+ZONE|TIMESTAMP\s+WITHOUT\s+TIME\s+ZONE|TIME\s+WITH\s+TIME\s+ZONE|TIME\s+WITHOUT\s+TIME\s+ZONE|INTERVAL|JSON|JSONB|UUID|BIT(\(\d+\))?|VARBIT(\(\d+\))?|BIT\s+VARYING(\(\d+\))?)(\[\])*$/i;

    // Also support complex types like STRUCT, MAP, LIST, ENUM with parentheses
    const complexTypePattern = /^(STRUCT|MAP|LIST|ENUM)\s*\(.+\)$/i;

    if (
      !typePattern.test(trimmedType) &&
      !complexTypePattern.test(trimmedType)
    ) {
      throw new Error(
        `Invalid column type: "${trimmedType}" is not a recognized SQL type`,
      );
    }

    return trimmedType;
  }

  protected static mapResultRow(
    schema: any[] | undefined,
    row: any,
  ): Record<string, unknown> {
    if (!Array.isArray(row)) {
      return (row ?? {}) as Record<string, unknown>;
    }

    if (!schema || schema.length === 0) {
      return row.reduce(
        (acc: Record<string, unknown>, value: unknown, index: number) => {
          acc[`col_${index}`] = value;
          return acc;
        },
        {},
      );
    }

    return schema.reduce(
      (acc: Record<string, unknown>, column: any, index: number) => {
        const key = column?.name || `col_${index}`;
        acc[key] = row[index];
        return acc;
      },
      {},
    );
  }
}
