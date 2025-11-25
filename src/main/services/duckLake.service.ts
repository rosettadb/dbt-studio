/**
 * DuckLake Service
 * Main service for managing DuckLake instances, catalogs, and operations
 * Follows the same architecture pattern as other services in the project
 */

import { DuckLakeInstanceStore } from './duckLake/instanceStore.service';
import { DuckLakeValidationService } from './duckLake/validation.service';
import { CatalogAdapterFactory, CatalogAdapter } from './duckLake/adapters';
import { DuckLakeConnectionManager } from './duckLake/connectionManager.service';
import CloudExplorerService from './cloudExplorer.service';
import { DuckLakeExtensionManager } from './duckLake/extensionManager.service';
import {
  DuckLakeInstance,
  DuckLakeInstanceCreateRequest,
  DuckLakeInstanceUpdateRequest,
  DuckLakeInstanceHealth,
  DuckLakeTableInfo,
  DuckLakeSnapshotInfo,
  DuckLakeQueryRequest,
  DuckLakeQueryResult,
  DuckLakeMaintenanceTask,
  DuckLakeCatalogConfig,
  DuckLakeMaintenanceType,
  DuckLakeStorageConfig,
} from '../../types/duckLake';
import { DuckLakeError } from '../../types/duckLakeErrors';

export default class DuckLakeService {
  private static initialized = false;

  // Service Initialization
  static async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await DuckLakeInstanceStore.initialize();
      await DuckLakeExtensionManager.initialize();
      DuckLakeConnectionManager.initialize();
      this.initialized = true;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to initialize DuckLake service:', error);
      throw error;
    }
  }

  // Extension Management
  static async loadDuckLakeExtension(): Promise<void> {
    try {
      await this.initialize();
      if (!DuckLakeExtensionManager.isExtensionAvailable()) {
        throw new Error('DuckLake extension is not available');
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  static async verifyExtension(): Promise<boolean> {
    try {
      await this.initialize();
      return DuckLakeExtensionManager.isExtensionAvailable();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      return false;
    }
  }

  // Instance Management
  static async listInstances(): Promise<DuckLakeInstance[]> {
    try {
      await this.initialize();
      return await DuckLakeInstanceStore.loadInstances();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  static async getInstance(id: string): Promise<DuckLakeInstance> {
    try {
      await this.initialize();
      return await DuckLakeInstanceStore.getInstance(id);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  static async createInstance(
    request: DuckLakeInstanceCreateRequest,
  ): Promise<DuckLakeInstance> {
    try {
      await this.initialize();

      // Validate the request
      DuckLakeValidationService.validateCreateRequest(request);

      // Validate data path accessibility
      await DuckLakeValidationService.validateDataPathAccess(request.dataPath);

      // Validate catalog path accessibility
      await DuckLakeValidationService.validateCatalogPathAccess(
        request.catalog,
      );

      // Create instance
      const id = this.generateInstanceId();
      const now = new Date();

      const instance: DuckLakeInstance = {
        id,
        ...request,
        createdAt: now,
        updatedAt: now,
        status: 'inactive',
      };

      // Save to persistent storage
      await DuckLakeInstanceStore.saveInstance(instance);

      return instance;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  static async updateInstance(
    id: string,
    request: DuckLakeInstanceUpdateRequest,
  ): Promise<DuckLakeInstance> {
    try {
      await this.initialize();

      // Validate the request
      DuckLakeValidationService.validateUpdateRequest(request);

      // Get existing instance
      const instance = await DuckLakeInstanceStore.getInstance(id);

      // Validate data path if changed
      if (request.dataPath && request.dataPath !== instance.dataPath) {
        await DuckLakeValidationService.validateDataPathAccess(
          request.dataPath,
        );
      }

      // Validate catalog path if changed
      if (request.catalog) {
        await DuckLakeValidationService.validateCatalogPathAccess(
          request.catalog,
        );
      }

      // Update instance
      const updatedInstance: DuckLakeInstance = {
        ...instance,
        ...request,
        updatedAt: new Date(),
      };

      // Save to persistent storage
      await DuckLakeInstanceStore.saveInstance(updatedInstance);

      // Reconnect if catalog config changed
      if (request.catalog) {
        await this.disconnectFromCatalog(id);
        // Connection will be re-established on next operation
      }

      return updatedInstance;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  static async deleteInstance(id: string): Promise<void> {
    try {
      await this.initialize();

      // Disconnect if connected
      await this.disconnectFromCatalog(id);

      // Delete from persistent storage (includes credential cleanup)
      await DuckLakeInstanceStore.deleteInstance(id);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  static async getInstanceHealth(id: string): Promise<DuckLakeInstanceHealth> {
    try {
      await this.initialize();
      const instance = await this.getInstance(id);

      const errors: string[] = [];
      const warnings: string[] = [];
      let dataPathAccessible = true;

      // Check data path accessibility
      try {
        await DuckLakeValidationService.validateDataPathAccess(
          instance.dataPath,
        );
      } catch (error) {
        dataPathAccessible = false;
        errors.push(`Data path not accessible: ${(error as Error).message}`);
      }

      // Check catalog path accessibility
      try {
        await DuckLakeValidationService.validateCatalogPathAccess(
          instance.catalog,
        );
      } catch (error) {
        errors.push(`Catalog path not accessible: ${(error as Error).message}`);
      }

      // No experimental features to check currently

      // Check extension status
      const extensionLoaded = DuckLakeExtensionManager.isExtensionAvailable();
      if (!extensionLoaded) {
        warnings.push('DuckLake extension is not loaded');
      }

      // Check connection status
      const connectionStatus =
        DuckLakeConnectionManager.getConnectionStatus(id);

      const health: DuckLakeInstanceHealth = {
        instanceId: id,
        status: instance.status,
        lastChecked: new Date(),
        catalogConnected: connectionStatus.connected,
        extensionLoaded,
        dataPathAccessible,
        errors,
        warnings,
      };

      return health;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  // Catalog Management
  static async connectToCatalog(instanceId: string): Promise<void> {
    try {
      await this.initialize();
      const instance = await this.getInstance(instanceId);

      // Check if already connected
      const connectionStatus =
        DuckLakeConnectionManager.getConnectionStatus(instanceId);
      if (connectionStatus.connected) {
        return; // Already connected
      }

      // Retrieve credentials (catalog and storage)
      const {
        catalog: catalogWithCredentials,
        storage: storageWithCredentials,
      } = await DuckLakeInstanceStore.retrieveCredentials(
        instanceId,
        instance.catalog as any,
        instance.storage as any,
      );

      // eslint-disable-next-line no-console
      console.debug(
        '[DuckLakeService.connectToCatalog] Resolved instance config',
        {
          instanceId,
          name: instance.name,
          dataPath: instance.dataPath,
          storageType: storageWithCredentials?.type,
          s3: storageWithCredentials?.s3,
        },
      );

      // Use connection manager to get connection
      await DuckLakeConnectionManager.getConnection(
        instanceId,
        instance,
        catalogWithCredentials,
        storageWithCredentials,
      );

      // Update instance status
      const updatedInstance = {
        ...instance,
        status: 'active' as const,
        updatedAt: new Date(),
      };
      await DuckLakeInstanceStore.saveInstance(updatedInstance);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw DuckLakeError.catalogConnection(instanceId, error as Error);
    }
  }

  static async disconnectFromCatalog(instanceId: string): Promise<void> {
    try {
      // Use connection manager to disconnect
      await DuckLakeConnectionManager.disconnect(instanceId);

      // Update instance status if it exists
      try {
        const instance = await DuckLakeInstanceStore.getInstance(instanceId);
        const updatedInstance = {
          ...instance,
          status: 'inactive' as const,
          updatedAt: new Date(),
        };
        await DuckLakeInstanceStore.saveInstance(updatedInstance);
      } catch (error) {
        // Instance might not exist anymore, ignore error
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  static async testCatalogConnection(
    config: DuckLakeCatalogConfig,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const adapter = CatalogAdapterFactory.createAdapter(config.type);
      const healthStatus = await adapter.testConnection(config);

      return {
        success: healthStatus.connected,
        error: healthStatus.error,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      return { success: false, error: (error as Error).message };
    }
  }

  // Table Management
  static async listTables(instanceId: string): Promise<DuckLakeTableInfo[]> {
    try {
      // eslint-disable-next-line no-console
      console.log(
        '[DuckLakeService.listTables] Starting for instanceId:',
        instanceId,
      );

      await this.ensureConnected(instanceId);
      // eslint-disable-next-line no-console
      console.log('[DuckLakeService.listTables] Connection ensured');

      const adapter = await this.getAdapter(instanceId);
      // eslint-disable-next-line no-console
      console.log(
        '[DuckLakeService.listTables] Adapter obtained:',
        adapter.constructor.name,
      );

      const tables = await adapter.listTables();
      // eslint-disable-next-line no-console
      console.log(
        '[DuckLakeService.listTables] Raw tables from adapter:',
        tables,
      );

      // Set instanceId for each table
      const result = tables.map((table) => ({
        ...table,
        instanceId,
      }));

      // eslint-disable-next-line no-console
      console.log('[DuckLakeService.listTables] Final result:', result);
      return result;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[DuckLakeService.listTables] Error:', error);
      throw error;
    }
  }

  static async getTable(
    instanceId: string,
    tableName: string,
  ): Promise<DuckLakeTableInfo> {
    try {
      await this.ensureConnected(instanceId);
      const adapter = await this.getAdapter(instanceId);

      const table = await adapter.getTable(tableName);

      return {
        ...table,
        instanceId,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  static async importTable(
    instanceId: string,
    tableName: string,
    sourceQuery: string,
  ): Promise<void> {
    try {
      // eslint-disable-next-line no-console
      console.log('DuckLakeService.importTable called with:', {
        instanceId,
        tableName,
        sourceQuery,
      });

      await this.ensureConnected(instanceId);
      const adapter = await this.getAdapter(instanceId);

      // Validate inputs
      if (!tableName || tableName.trim() === '') {
        throw DuckLakeError.validation('Table name is required');
      }

      if (!sourceQuery || sourceQuery.trim() === '') {
        throw DuckLakeError.validation('Source query is required');
      }

      // Execute the import query
      // This follows the DuckLake pattern: CREATE TABLE name AS FROM 'source'
      // DuckLake will:
      // 1. Read the source data
      // 2. Infer the schema automatically
      // 3. Create metadata in the catalog
      // 4. Write data as Parquet files in DATA_PATH
      // 5. Create initial snapshot
      await adapter.executeQuery({
        instanceId,
        sql: sourceQuery,
      });

      // eslint-disable-next-line no-console
      console.log(
        `Table ${tableName} imported successfully in instance ${instanceId}`,
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to import table ${tableName}:`, error);
      throw error;
    }
  }

  static async deleteTable(
    instanceId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    tableName: string,
  ): Promise<void> {
    try {
      await this.ensureConnected(instanceId);

      // TODO: Implement table deletion for tableName
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  /**
   * Get comprehensive table details from DuckLake metadata catalog (Phase 8b)
   */
  static async getTableDetails(
    instanceId: string,
    tableName: string,
  ): Promise<any> {
    try {
      // eslint-disable-next-line no-console
      console.log('[DuckLakeService.getTableDetails] Starting for:', {
        instanceId,
        tableName,
      });

      await this.ensureConnected(instanceId);
      const adapter = await this.getAdapter(instanceId);

      // eslint-disable-next-line no-console
      console.log(
        '[DuckLakeService.getTableDetails] Adapter obtained:',
        adapter.constructor.name,
      );

      const details = await adapter.getTableDetails(tableName);

      // eslint-disable-next-line no-console
      console.log('[DuckLakeService.getTableDetails] Details retrieved:', {
        tableName: details.tableName,
        columnsCount: details.columns?.length,
        dataFilesCount: details.dataFiles?.length,
        snapshotsCount: details.snapshots?.length,
      });

      return details;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[DuckLakeService.getTableDetails] Error:', error);
      throw error;
    }
  }

  // Snapshot Management
  static async listSnapshots(
    instanceId: string,
    tableName: string,
  ): Promise<DuckLakeSnapshotInfo[]> {
    try {
      await this.ensureConnected(instanceId);
      const adapter = await this.getAdapter(instanceId);

      return await adapter.listSnapshots(tableName);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  static async restoreSnapshot(
    instanceId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    tableName: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    snapshotId: string,
  ): Promise<void> {
    try {
      await this.ensureConnected(instanceId);
      // TODO: Implement snapshot restoration for tableName using snapshotId
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  // Query Execution
  static async executeQuery(
    request: DuckLakeQueryRequest,
  ): Promise<DuckLakeQueryResult> {
    try {
      await this.ensureConnected(request.instanceId);
      const adapter = await this.getAdapter(request.instanceId);

      return await adapter.executeQuery(request);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  // Maintenance Operations
  static async startMaintenanceTask(
    instanceId: string,
    type: DuckLakeMaintenanceType,
    tableName?: string,
  ): Promise<DuckLakeMaintenanceTask> {
    try {
      await this.ensureConnected(instanceId);

      // TODO: Implement maintenance task scheduling for tableName (if provided)
      const taskId = this.generateTaskId();
      const task: DuckLakeMaintenanceTask = {
        id: taskId,
        instanceId,
        type,
        status: 'pending',
        startedAt: new Date(),
        tableName, // Include tableName in task for future use
      };

      return task;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  static async getMaintenanceTaskStatus(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    taskId: string,
  ): Promise<DuckLakeMaintenanceTask> {
    try {
      // TODO: Implement task status retrieval for taskId
      throw new Error('Not implemented');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  // Private Helper Methods

  private static async ensureConnected(instanceId: string): Promise<void> {
    const connectionStatus =
      DuckLakeConnectionManager.getConnectionStatus(instanceId);
    if (!connectionStatus.connected) {
      await this.connectToCatalog(instanceId);
    }
  }

  private static async getAdapter(instanceId: string): Promise<CatalogAdapter> {
    const instance = await this.getInstance(instanceId);
    const { catalog: catalogWithCredentials, storage: storageWithCredentials } =
      await DuckLakeInstanceStore.retrieveCredentials(
        instanceId,
        instance.catalog as any,
        instance.storage as any,
      );

    return DuckLakeConnectionManager.getConnection(
      instanceId,
      instance,
      catalogWithCredentials,
      storageWithCredentials,
    );
  }

  private static generateInstanceId(): string {
    return `ducklake_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private static generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate storage connection
   */
  static async validateStorageConnection(
    storageConfig: DuckLakeStorageConfig,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      DuckLakeValidationService.validateStorageConfig(storageConfig);

      let success = false;
      switch (storageConfig.type) {
        case 'local':
          // For local, we just check if path exists or can be created
          if (storageConfig.local?.path) {
            await DuckLakeValidationService.validateDataPathAccess(
              storageConfig.local.path,
            );
            success = true;
          }
          break;
        case 's3':
          if (storageConfig.s3) {
            success = await CloudExplorerService.testConnection('aws', {
              region: storageConfig.s3.region,
              accessKeyId: storageConfig.s3.accessKeyId,
              secretAccessKey: storageConfig.s3.secretAccessKey,
            });
          }
          break;
        case 'azure':
          if (storageConfig.azure) {
            success = await CloudExplorerService.testConnection('azure', {
              accountName: storageConfig.azure.accountName,
              accountKey: storageConfig.azure.accountKey,
              connectionString: storageConfig.azure.connectionString,
            });
          }
          break;
        case 'gcs':
          if (storageConfig.gcs) {
            success = await CloudExplorerService.testConnection('gcs', {
              projectId: storageConfig.gcs.projectId,
              credentials: storageConfig.gcs.credentials,
            });
          }
          break;
        default:
          throw new Error(`Unsupported storage type: ${storageConfig.type}`);
      }

      if (!success) {
        return { success: false, error: 'Connection failed' };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // Storage Management
  static async getStorageStats(): Promise<{
    instanceCount: number;
    storageSize: number;
    lastModified: Date;
  }> {
    try {
      await this.initialize();
      return await DuckLakeInstanceStore.getStorageStats();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }
}
