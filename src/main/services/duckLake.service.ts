/**
 * DuckLake Service
 * Main service for managing DuckLake instances, catalogs, and operations
 * Follows the same architecture pattern as other services in the project
 */

import DuckLakeInstanceStore from './duckLake/instanceStore.service';
import DuckLakeValidationService from './duckLake/validation.service';
import { CatalogAdapterFactory, CatalogAdapter } from './duckLake/adapters';
import DuckLakeConnectionManager from './duckLake/connectionManager.service';
import CloudExplorerService from './cloudExplorer.service';
import DuckLakeExtensionManager from './duckLake/extensionManager.service';
import {
  DuckLakeInstance,
  DuckLakeInstanceCreateRequest,
  DuckLakeInstanceUpdateRequest,
  DuckLakeInstanceHealth,
  DuckLakeTableInfo,
  DuckLakeSnapshotInfo,
  DuckLakeSnapshotDetail,
  DuckLakeQueryRequest,
  DuckLakeQueryResult,
  DuckLakeMaintenanceTask,
  DuckLakeCatalogConfig,
  DuckLakeMaintenanceType,
  DuckLakeStorageConfig,
  DuckLakeSnapshotParams,
  DuckLakePaginatedResult,
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

  static async addColumn(
    instanceId: string,
    tableName: string,
    columnName: string,
    columnType: string,
    defaultValue?: string,
  ): Promise<void> {
    try {
      await this.ensureConnected(instanceId);
      const adapter = await this.getAdapter(instanceId);

      if (!tableName || tableName.trim() === '') {
        throw DuckLakeError.validation('Table name is required');
      }

      if (!columnName || columnName.trim() === '') {
        throw DuckLakeError.validation('Column name is required');
      }

      if (!columnType || columnType.trim() === '') {
        throw DuckLakeError.validation('Column type is required');
      }

      const tables = await adapter.listTables();
      const tableExists = tables.some((t) => t.name === tableName);
      if (!tableExists) {
        throw DuckLakeError.validation(`Table ${tableName} does not exist`);
      }

      const details = await adapter.getTableDetails(tableName);
      const existingColumns = Array.isArray(details?.columns)
        ? details.columns
        : [];
      const columnExists = existingColumns.some(
        (c: any) => c?.columnName === columnName && c?.endSnapshot == null,
      );
      if (columnExists) {
        throw DuckLakeError.validation(
          `Column ${columnName} already exists on table ${tableName}`,
        );
      }

      await adapter.addColumn(tableName, columnName, columnType, defaultValue);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  static async dropColumn(
    instanceId: string,
    tableName: string,
    columnName: string,
  ): Promise<void> {
    try {
      await this.ensureConnected(instanceId);
      const adapter = await this.getAdapter(instanceId);

      if (!tableName || tableName.trim() === '') {
        throw DuckLakeError.validation('Table name is required');
      }

      if (!columnName || columnName.trim() === '') {
        throw DuckLakeError.validation('Column name is required');
      }

      const tables = await adapter.listTables();
      const tableExists = tables.some((t) => t.name === tableName);
      if (!tableExists) {
        throw DuckLakeError.validation(`Table ${tableName} does not exist`);
      }

      const details = await adapter.getTableDetails(tableName);
      const existingColumns = Array.isArray(details?.columns)
        ? details.columns
        : [];
      const activeColumn = existingColumns.find(
        (c: any) => c?.columnName === columnName && c?.endSnapshot == null,
      );
      if (!activeColumn) {
        throw DuckLakeError.validation(
          `Column ${columnName} does not exist on table ${tableName}`,
        );
      }

      const partitionColumnIds = new Set<number>(
        (details?.partitionInfo?.columns || []).map((c: any) =>
          Number(c.columnId),
        ),
      );
      if (partitionColumnIds.has(Number(activeColumn.columnId))) {
        throw DuckLakeError.validation(
          `Column ${columnName} is a partition column and cannot be dropped`,
        );
      }

      await adapter.dropColumn(tableName, columnName);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  static async renameColumn(
    instanceId: string,
    tableName: string,
    oldColumnName: string,
    newColumnName: string,
  ): Promise<void> {
    try {
      await this.ensureConnected(instanceId);
      const adapter = await this.getAdapter(instanceId);

      if (!tableName || tableName.trim() === '') {
        throw DuckLakeError.validation('Table name is required');
      }

      if (!oldColumnName || oldColumnName.trim() === '') {
        throw DuckLakeError.validation('Old column name is required');
      }

      if (!newColumnName || newColumnName.trim() === '') {
        throw DuckLakeError.validation('New column name is required');
      }

      if (oldColumnName.trim() === newColumnName.trim()) {
        throw DuckLakeError.validation('New column name must be different');
      }

      const tables = await adapter.listTables();
      const tableExists = tables.some((t) => t.name === tableName);
      if (!tableExists) {
        throw DuckLakeError.validation(`Table ${tableName} does not exist`);
      }

      const details = await adapter.getTableDetails(tableName);
      const existingColumns = Array.isArray(details?.columns)
        ? details.columns
        : [];
      const activeOldColumn = existingColumns.find(
        (c: any) => c?.columnName === oldColumnName && c?.endSnapshot == null,
      );
      if (!activeOldColumn) {
        throw DuckLakeError.validation(
          `Column ${oldColumnName} does not exist on table ${tableName}`,
        );
      }

      const newColumnExists = existingColumns.some(
        (c: any) => c?.columnName === newColumnName && c?.endSnapshot == null,
      );
      if (newColumnExists) {
        throw DuckLakeError.validation(
          `Column ${newColumnName} already exists on table ${tableName}`,
        );
      }

      const partitionColumnIds = new Set<number>(
        (details?.partitionInfo?.columns || []).map((c: any) =>
          Number(c.columnId),
        ),
      );
      if (partitionColumnIds.has(Number(activeOldColumn.columnId))) {
        throw DuckLakeError.validation(
          `Column ${oldColumnName} is a partition column and cannot be renamed`,
        );
      }

      await adapter.renameColumn(tableName, oldColumnName, newColumnName);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  static async alterColumnType(
    instanceId: string,
    tableName: string,
    columnName: string,
    newType: string,
  ): Promise<void> {
    try {
      await this.ensureConnected(instanceId);
      const adapter = await this.getAdapter(instanceId);

      if (!tableName || tableName.trim() === '') {
        throw DuckLakeError.validation('Table name is required');
      }

      if (!columnName || columnName.trim() === '') {
        throw DuckLakeError.validation('Column name is required');
      }

      if (!newType || newType.trim() === '') {
        throw DuckLakeError.validation('New column type is required');
      }

      const tables = await adapter.listTables();
      const tableExists = tables.some((t) => t.name === tableName);
      if (!tableExists) {
        throw DuckLakeError.validation(`Table ${tableName} does not exist`);
      }

      const details = await adapter.getTableDetails(tableName);
      const existingColumns = Array.isArray(details?.columns)
        ? details.columns
        : [];
      const activeColumn = existingColumns.find(
        (c: any) => c?.columnName === columnName && c?.endSnapshot == null,
      );
      if (!activeColumn) {
        throw DuckLakeError.validation(
          `Column ${columnName} does not exist on table ${tableName}`,
        );
      }

      const partitionColumnIds = new Set<number>(
        (details?.partitionInfo?.columns || []).map((c: any) =>
          Number(c.columnId),
        ),
      );
      if (partitionColumnIds.has(Number(activeColumn.columnId))) {
        throw DuckLakeError.validation(
          `Column ${columnName} is a partition column and cannot be altered`,
        );
      }

      await adapter.alterColumnType(tableName, columnName, newType);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  static async setPartitionedBy(
    instanceId: string,
    tableName: string,
    columnNames: string[],
  ): Promise<void> {
    try {
      await this.ensureConnected(instanceId);
      const adapter = await this.getAdapter(instanceId);

      if (!tableName || tableName.trim() === '') {
        throw DuckLakeError.validation('Table name is required');
      }

      if (!Array.isArray(columnNames) || columnNames.length === 0) {
        throw DuckLakeError.validation(
          'At least one partition column is required',
        );
      }

      const normalizedColumns = columnNames
        .map((c) => c?.trim())
        .filter((c): c is string => !!c);
      if (normalizedColumns.length === 0) {
        throw DuckLakeError.validation(
          'At least one partition column is required',
        );
      }

      const tables = await adapter.listTables();
      const tableExists = tables.some((t) => t.name === tableName);
      if (!tableExists) {
        throw DuckLakeError.validation(`Table ${tableName} does not exist`);
      }

      const details = await adapter.getTableDetails(tableName);
      const existingColumns = Array.isArray(details?.columns)
        ? details.columns
        : [];

      normalizedColumns.forEach((col) => {
        const activeColumn = existingColumns.find(
          (c: any) => c?.columnName === col && c?.endSnapshot == null,
        );
        if (!activeColumn) {
          throw DuckLakeError.validation(
            `Column ${col} does not exist on table ${tableName}`,
          );
        }
      });

      await adapter.setPartitionedBy(tableName, normalizedColumns);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  static async renameTable(
    instanceId: string,
    oldName: string,
    newName: string,
  ): Promise<void> {
    try {
      await this.ensureConnected(instanceId);
      const adapter = await this.getAdapter(instanceId);

      if (!oldName || oldName.trim() === '') {
        throw DuckLakeError.validation('Old table name is required');
      }

      if (!newName || newName.trim() === '') {
        throw DuckLakeError.validation('New table name is required');
      }

      if (oldName.trim() === newName.trim()) {
        throw DuckLakeError.validation('New table name must be different');
      }

      const tables = await adapter.listTables();
      const oldExists = tables.some((t) => t.name === oldName);
      if (!oldExists) {
        throw DuckLakeError.validation(`Table ${oldName} does not exist`);
      }

      const newExists = tables.some((t) => t.name === newName);
      if (newExists) {
        throw DuckLakeError.validation(`Table ${newName} already exists`);
      }

      await adapter.renameTable(oldName, newName);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  static async updateRows(
    instanceId: string,
    tableName: string,
    updateQuery: string,
  ): Promise<{ rowsAffected: number }> {
    try {
      await this.ensureConnected(instanceId);
      const adapter = await this.getAdapter(instanceId);

      if (!tableName || tableName.trim() === '') {
        throw DuckLakeError.validation('Table name is required');
      }

      if (!updateQuery || updateQuery.trim() === '') {
        throw DuckLakeError.validation('Update query is required');
      }

      const normalizedQuery = updateQuery.trim().toUpperCase();
      if (
        !normalizedQuery.startsWith('UPDATE') &&
        !normalizedQuery.startsWith('CREATE')
      ) {
        throw DuckLakeError.validation(
          'Query must be an UPDATE or CREATE statement',
        );
      }

      const tables = await adapter.listTables();
      const tableExists = tables.some((t) => t.name === tableName);
      if (!tableExists) {
        throw DuckLakeError.validation(`Table ${tableName} does not exist`);
      }

      return await adapter.updateRows(tableName, updateQuery);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  static async deleteRows(
    instanceId: string,
    tableName: string,
    deleteQuery: string,
  ): Promise<{ rowsAffected: number }> {
    try {
      await this.ensureConnected(instanceId);
      const adapter = await this.getAdapter(instanceId);

      if (!tableName || tableName.trim() === '') {
        throw DuckLakeError.validation('Table name is required');
      }

      if (!deleteQuery || deleteQuery.trim() === '') {
        throw DuckLakeError.validation('Delete query is required');
      }

      if (!deleteQuery.trim().toUpperCase().startsWith('DELETE')) {
        throw DuckLakeError.validation('Query must be a DELETE statement');
      }

      const tables = await adapter.listTables();
      const tableExists = tables.some((t) => t.name === tableName);
      if (!tableExists) {
        throw DuckLakeError.validation(`Table ${tableName} does not exist`);
      }

      return await adapter.deleteRows(tableName, deleteQuery);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  static async upsertRows(
    instanceId: string,
    tableName: string,
    upsertQuery: string,
  ): Promise<{ rowsAffected: number }> {
    try {
      await this.ensureConnected(instanceId);
      const adapter = await this.getAdapter(instanceId);

      if (!tableName || tableName.trim() === '') {
        throw DuckLakeError.validation('Table name is required');
      }

      if (!upsertQuery || upsertQuery.trim() === '') {
        throw DuckLakeError.validation('Upsert query is required');
      }

      if (!upsertQuery.trim().toUpperCase().startsWith('INSERT')) {
        throw DuckLakeError.validation('Query must be an INSERT statement');
      }

      const tables = await adapter.listTables();
      const tableExists = tables.some((t) => t.name === tableName);
      if (!tableExists) {
        throw DuckLakeError.validation(`Table ${tableName} does not exist`);
      }

      return await adapter.upsertRows(tableName, upsertQuery);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
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

      // Resolve storage config with credentials when using saved connections
      let storageConfig = request.storage;
      if (request.storage?.connectionId) {
        storageConfig = await this.getStorageConfigWithCredentials(
          request.storage,
        );
      }

      // Create instance
      const id = this.generateInstanceId();
      const now = new Date();

      const instance: DuckLakeInstance = {
        id,
        ...request,
        storage: storageConfig ?? request.storage,
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

      // Resolve storage config with credentials when using saved connections
      let storageConfig = request.storage;
      if (request.storage?.connectionId) {
        storageConfig = await this.getStorageConfigWithCredentials(
          request.storage,
        );
      }

      // Update instance
      const updatedInstance: DuckLakeInstance = {
        ...instance,
        ...request,
        storage: storageConfig ?? request.storage ?? instance.storage,
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
      let storageConnected: boolean | undefined;
      let storageLocation: string | undefined;

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
      // Check extension status
      const extensionLoaded = DuckLakeExtensionManager.isExtensionAvailable();
      if (!extensionLoaded) {
        warnings.push('DuckLake extension is not loaded');
      }

      // Test catalog connectivity by attempting to establish a connection
      let catalogConnected = false;
      try {
        // ensureConnected will test if we can connect to the catalog
        await this.ensureConnected(id);
        catalogConnected = true;
      } catch (error) {
        catalogConnected = false;
        errors.push(`Catalog connection failed: ${(error as Error).message}`);
      }

      // Test storage connectivity if configured
      if (instance.storage) {
        storageLocation = instance.dataPath;
        const storageResult = await this.validateStorageConnection(
          instance.storage,
        );
        storageConnected = storageResult.success;
        if (!storageResult.success && storageResult.error) {
          errors.push(`Storage connection failed: ${storageResult.error}`);
        }
      }

      const health: DuckLakeInstanceHealth = {
        instanceId: id,
        status: instance.status,
        lastChecked: new Date(),
        catalogConnected,
        extensionLoaded,
        dataPathAccessible,
        storageConnected,
        storageLocation,
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

  /**
   * Internal helper: Establishes connection to catalog (lazy connection pattern)
   * Called automatically by ensureConnected() when queries need a connection
   * Note: Does NOT update instance status - status represents configuration state, not connection state
   */
  private static async connectToCatalog(instanceId: string): Promise<void> {
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
      const { catalog: catalogWithCredentials, storage: persistedStorage } =
        await DuckLakeInstanceStore.retrieveCredentials(
          instanceId,
          instance.catalog as any,
          instance.storage as any,
        );

      let storageWithCredentials = persistedStorage;
      if (this.storageConfigNeedsResolution(persistedStorage)) {
        storageWithCredentials = await this.getStorageConfigWithCredentials(
          persistedStorage!,
        );
      }

      // eslint-disable-next-line no-console
      console.debug(
        '[DuckLakeService.connectToCatalog] Establishing lazy connection',
        {
          instanceId,
          name: instance.name,
          dataPath: instance.dataPath,
        },
      );

      // Use connection manager to get connection
      await DuckLakeConnectionManager.getConnection(
        instanceId,
        instance,
        catalogWithCredentials,
        storageWithCredentials,
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[DuckLakeService.connectToCatalog] Error:', error);
      throw DuckLakeError.catalogConnection(instanceId, error as Error);
    }
  }

  /**
   * Internal helper: Disconnects from catalog
   * Called by connection manager during idle cleanup
   * Note: Does NOT update instance status - status represents configuration state, not connection state
   */
  private static async disconnectFromCatalog(
    instanceId: string,
  ): Promise<void> {
    try {
      // Use connection manager to disconnect
      await DuckLakeConnectionManager.disconnect(instanceId);

      // eslint-disable-next-line no-console
      console.debug('[DuckLakeService.disconnectFromCatalog] Disconnected', {
        instanceId,
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[DuckLakeService.disconnectFromCatalog] Error:', error);
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
      await this.ensureConnected(instanceId);

      const adapter = await this.getAdapter(instanceId);

      const tables = await adapter.listTables();

      // Set instanceId for each table
      const result = tables.map((table) => ({
        ...table,
        instanceId,
      }));

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
    tableName: string,
  ): Promise<void> {
    try {
      await this.ensureConnected(instanceId);

      const adapter = await this.getAdapter(instanceId);

      if (!tableName || tableName.trim() === '') {
        throw DuckLakeError.validation('Table name is required');
      }

      const tables = await adapter.listTables();
      const tableExists = tables.some((t) => t.name === tableName);
      if (!tableExists) {
        throw DuckLakeError.validation(`Table ${tableName} does not exist`);
      }

      await adapter.deleteTable(tableName);
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

  static async listInstanceSnapshots(
    instanceId: string,
    params: DuckLakeSnapshotParams = { page: 1, pageSize: 100 },
  ): Promise<DuckLakePaginatedResult<DuckLakeSnapshotDetail>> {
    try {
      await this.ensureConnected(instanceId);
      const adapter = await this.getAdapter(instanceId);
      return await adapter.listInstanceSnapshots(params);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `[DuckLakeService] Failed to list instance snapshots for ${instanceId}:`,
        error,
      );
      throw error;
    }
  }

  static async restoreSnapshot(
    instanceId: string,
    tableName: string,
    snapshotId: string,
  ): Promise<void> {
    try {
      await this.ensureConnected(instanceId);

      const adapter = await this.getAdapter(instanceId);

      if (!tableName || tableName.trim() === '') {
        throw DuckLakeError.validation('Table name is required');
      }

      if (!snapshotId || snapshotId.trim() === '') {
        throw DuckLakeError.validation('Snapshot ID is required');
      }

      const parsedSnapshotId = Number.parseInt(snapshotId, 10);
      if (Number.isNaN(parsedSnapshotId)) {
        throw DuckLakeError.validation('Snapshot ID must be a number');
      }

      // Validate table exists
      const tables = await adapter.listTables();
      const tableExists = tables.some((t) => t.name === tableName);
      if (!tableExists) {
        throw DuckLakeError.validation(`Table ${tableName} does not exist`);
      }

      // Validate snapshot exists for table
      const snapshots = await adapter.listSnapshots(tableName);
      const snapshotExists = snapshots.some(
        (s) => Number.parseInt(String(s.id), 10) === parsedSnapshotId,
      );
      if (!snapshotExists) {
        throw DuckLakeError.validation(
          `Snapshot ${snapshotId} not found for table ${tableName}`,
        );
      }

      await adapter.restoreSnapshot(tableName, parsedSnapshotId);
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
    const { catalog: catalogWithCredentials, storage: persistedStorage } =
      await DuckLakeInstanceStore.retrieveCredentials(
        instanceId,
        instance.catalog as any,
        instance.storage as any,
      );

    let storageWithCredentials = persistedStorage;
    if (this.storageConfigNeedsResolution(persistedStorage)) {
      storageWithCredentials = await this.getStorageConfigWithCredentials(
        persistedStorage!,
      );
    }

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

      // Resolve full config with credentials if using connectionId
      const fullConfig =
        await this.getStorageConfigWithCredentials(storageConfig);

      let success = false;
      switch (fullConfig.type) {
        case 'local':
          // For local, we just check if path exists or can be created
          if (fullConfig.local?.path) {
            await DuckLakeValidationService.validateDataPathAccess(
              fullConfig.local.path,
            );
            success = true;
          }
          break;
        case 's3':
          if (fullConfig.s3) {
            try {
              success = await CloudExplorerService.testConnection('aws', {
                region: fullConfig.s3.region,
                accessKeyId: fullConfig.s3.accessKeyId,
                secretAccessKey: fullConfig.s3.secretAccessKey,
              });
            } catch (error) {
              return { success: false, error: (error as Error).message };
            }
          }
          break;
        case 'azure':
          if (fullConfig.azure) {
            try {
              success = await CloudExplorerService.testConnection('azure', {
                accountName: fullConfig.azure.accountName,
                accountKey: fullConfig.azure.accountKey,
                connectionString: fullConfig.azure.connectionString,
              });
            } catch (error) {
              return { success: false, error: (error as Error).message };
            }
          }
          break;
        case 'gcs':
          if (fullConfig.gcs) {
            try {
              success = await CloudExplorerService.testConnection('gcs', {
                projectId: fullConfig.gcs.projectId,
                credentials: fullConfig.gcs.credentials,
              });
            } catch (error) {
              // Propagate the specific error message from testGCSConnection
              return { success: false, error: (error as Error).message };
            }
          }
          break;
        default:
          throw new Error(`Unsupported storage type: ${fullConfig.type}`);
      }

      if (!success) {
        return { success: false, error: 'Connection failed' };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // Cloud Connection Integration
  /**
   * Resolve cloud connection from Cloud Explorer database
   */
  static async resolveCloudConnection(
    connectionId: string,
  ): Promise<any | null> {
    try {
      const ConnectorsService = (await import('./connectors.service')).default;
      return await ConnectorsService.getCloudConnectionById(connectionId);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to resolve cloud connection:', error);
      return null;
    }
  }

  /**
   * Get full storage config with credentials from Cloud Explorer connection
   */
  static async getStorageConfigWithCredentials(
    storage: DuckLakeStorageConfig,
  ): Promise<DuckLakeStorageConfig> {
    try {
      // If no connectionId, return as-is (local or legacy inline config)
      if (!storage.connectionId) {
        return storage;
      }

      // Resolve the cloud connection
      const connection = await this.resolveCloudConnection(
        storage.connectionId,
      );
      if (!connection) {
        throw new Error(`Cloud connection not found: ${storage.connectionId}`);
      }

      // Fetch credentials from secure storage
      const credentials = await this.getConnectionCredentials(connection);

      // Merge connection config with DataLake-specific properties
      const result: DuckLakeStorageConfig = {
        type: storage.type,
        connectionId: storage.connectionId,
        bucket: storage.bucket,
        prefix: storage.prefix,
      };

      // Add provider-specific config with credentials
      if (storage.type === 's3' && connection.provider === 'aws') {
        result.s3 = {
          ...connection.config,
          ...credentials,
          bucket: storage.bucket || '',
          prefix: storage.prefix,
        };
      } else if (storage.type === 'azure' && connection.provider === 'azure') {
        result.azure = {
          ...connection.config,
          ...credentials,
          container: storage.bucket || '',
          prefix: storage.prefix,
        };
      } else if (storage.type === 'gcs' && connection.provider === 'gcs') {
        result.gcs = {
          ...connection.config,
          ...credentials,
          bucket: storage.bucket || '',
          prefix: storage.prefix,
        };
      }

      return result;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to get storage config with credentials:', error);
      throw error;
    }
  }

  /**
   * Fetch credentials from secure storage for a cloud connection
   */
  private static async getConnectionCredentials(connection: any): Promise<any> {
    try {
      const SecureStorageService = (await import('./secureStorage.service'))
        .default;
      const { provider, id } = connection;

      if (provider === 'aws') {
        const secretAccessKey = await SecureStorageService.getCredential(
          `cloud-aws-${id}`,
        );
        return { secretAccessKey };
      }

      if (provider === 'azure') {
        const accountKey = await SecureStorageService.getCredential(
          `cloud-azure-${id}`,
        );
        return { accountKey };
      }

      if (provider === 'gcs') {
        const credentials = await SecureStorageService.getCredential(
          `cloud-gcs-${id}`,
        );
        return { credentials };
      }

      return {};
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to get connection credentials:', error);
      throw error;
    }
  }

  private static storageConfigNeedsResolution(
    storage?: DuckLakeStorageConfig,
  ): storage is DuckLakeStorageConfig & { connectionId: string } {
    if (!storage?.connectionId) {
      return false;
    }

    switch (storage.type) {
      case 's3':
        return (
          !storage.s3 ||
          !storage.s3.region ||
          !storage.s3.accessKeyId ||
          !storage.s3.secretAccessKey
        );
      case 'azure':
        return (
          !storage.azure ||
          (!storage.azure.connectionString &&
            (!storage.azure.accountName || !storage.azure.accountKey))
        );
      case 'gcs':
        return (
          !storage.gcs || !storage.gcs.projectId || !storage.gcs.credentials
        );
      default:
        return false;
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
