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
  DuckLakeQueryResult,
  DuckLakeQueryRequest,
} from '../../../../types/duckLake';

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

        // DuckDB Node.js API handles connection cleanup automatically
        this.connectionInfo = null;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error during connection cleanup:', error);
      }
    }
  }
}
