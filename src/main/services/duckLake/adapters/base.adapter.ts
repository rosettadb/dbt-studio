/**
 * Base Catalog Adapter Interface
 * Defines the contract for all catalog-specific implementations
 */

import {
  DuckLakeCatalogConfig,
  DuckLakeInstance,
  DuckLakeTableInfo,
  DuckLakeSnapshotInfo,
  DuckLakeQueryResult,
  DuckLakeQueryRequest,
  DuckLakeStorageConfig,
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
   * Now uses shared persistent DuckDB from DuckDBBootstrap instead of creating new instances
   *
   * Phase 2 Change: DuckLake adapters now use the shared persistent main.duckdb
   * Multiple DuckLake catalogs can be attached to the same DuckDB engine
   */
  // eslint-disable-next-line class-methods-use-this
  protected async initializeDuckDB(
    runtimeOptions?: DuckLakeInstance['runtimeOptions'],
  ): Promise<any> {
    try {
      // Import DuckDBBootstrap dynamically to avoid circular dependency
      const { DuckDBBootstrap } = await import('../../duckdb.bootstrap');

      // Verify shared DuckDB is initialized
      const dbMeta = DuckDBBootstrap.getMetadata();
      if (!dbMeta.initialized) {
        throw new Error(
          '[DuckLake] Shared DuckDB not initialized. Call DuckDBBootstrap.initialize() first.',
        );
      }

      // Log runtime options if provided (for future use)
      if (runtimeOptions) {
        // eslint-disable-next-line no-console
        console.log(
          '[DuckLake] Runtime options provided (currently ignored for shared DB):',
          {
            maxMemory: runtimeOptions.maxMemory,
            threads: runtimeOptions.threads,
            tempDirectory: runtimeOptions.tempDirectory,
          },
        );
        // Note: Runtime options are set at bootstrap level, not per-adapter
        // Future enhancement: Could validate that bootstrap settings meet requirements
      }

      // eslint-disable-next-line no-console
      console.log('[DuckLake] Using shared persistent DuckDB instance');

      // Return null - adapters will get connections from pool instead
      return null;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        '[DuckLake] Failed to access shared DuckDB instance:',
        error,
      );
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

      // Check if already attached to avoid "database already exists" errors
      // This happens because we use a persistent DuckDB instance
      const safeInstanceName = instanceName.replace(/'/g, "''");
      const checkQuery = `SELECT database_name FROM duckdb_databases() WHERE database_name = '${safeInstanceName}'`;
      const checkResult = await connection.run(checkQuery);
      const existing = await checkResult.getRows();

      if (existing.length === 0) {
        const attachQuery = `ATTACH '${attachString}' AS "${escapedInstanceName}" (DATA_PATH '${dataPath.replace(/'/g, "''")}')`;
        await connection.run(attachQuery);
      } else {
        // eslint-disable-next-line no-console
        console.log(
          `[DuckLake] Catalog '${instanceName}' already attached, skipping ATTACH.`,
        );
      }

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

      // 1. Find a safe database to switch to (anything other than the one we're detaching)
      const dbsResult = await connection.run(
        'SELECT database_name FROM duckdb_databases()',
      );
      const allDbs = await dbsResult.getRows();
      const dbNames = allDbs.map((r: any) =>
        Array.isArray(r) ? r[0] : r.database_name,
      );

      const safeDb = dbNames.find(
        (name: string) => name !== instanceName && name !== escapedInstanceName,
      );

      if (safeDb) {
        try {
          // Quote the database name if needed
          const safeDbQuoted = `"${safeDb.replace(/"/g, '""')}"`;
          await connection.run(`USE ${safeDbQuoted}`);
          // console.log(`[DuckLake] Switched to safe database: ${safeDb}`);
        } catch (switchError) {
          // eslint-disable-next-line no-console
          console.warn(
            `[DuckLake] Failed to switch to safe database ${safeDb}:`,
            switchError,
          );
        }
      } else {
        // eslint-disable-next-line no-console
        console.warn(
          '[DuckLake] No safe database found to switch to before detaching!',
        );
      }

      // 2. Check if catalog exists before detaching
      const safeInstanceName = instanceName.replace(/'/g, "''");
      const checkQuery = `SELECT database_name FROM duckdb_databases() WHERE database_name = '${safeInstanceName}'`;
      const checkResult = await connection.run(checkQuery);
      const existing = await checkResult.getRows();

      if (existing.length > 0) {
        const detachQuery = `DETACH "${escapedInstanceName}"`;
        await connection.run(detachQuery);
        // eslint-disable-next-line no-console
        console.log(
          `[DuckLake] Successfully detached catalog: ${instanceName}`,
        );
      } else {
        // eslint-disable-next-line no-console
        console.log(
          `[DuckLake] Catalog '${instanceName}' not attached, skipping DETACH.`,
        );
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to detach DuckLake catalog:', error);
      // Don't throw - we still want to clean up even if detach fails
    }
  }

  /**
   * Common cleanup for connections
   * Now properly executes DETACH before cleanup to free memory
   *
   * Phase 2 Change: Releases connection back to pool instead of destroying instance
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

        // Release connection back to pool instead of destroying instance
        if (this.connectionInfo.connection) {
          const { DuckDBBootstrap } = await import('../../duckdb.bootstrap');
          DuckDBBootstrap.releaseConnection(
            this.connectionInfo.connection,
            `DuckLake:${this.connectionInfo.instanceName || 'unknown'}`,
          );
          // eslint-disable-next-line no-console
          console.log(
            `[DuckLake] Connection released to pool for instance: ${this.connectionInfo.instanceName}`,
          );
        }

        this.connectionInfo = null;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[DuckLake] Error during connection cleanup:', error);
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
}
