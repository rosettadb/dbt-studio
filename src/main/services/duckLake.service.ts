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
  DuckLakeSchemaInfo,
  DuckLakeSchemaTable,
} from '../../types/duckLake';
import { DuckLakeError } from '../../types/duckLakeErrors';

/**
 * Validates a SQL query to prevent statement chaining attacks
 * @param query The SQL query to validate
 * @param expectedPrefix The expected SQL statement prefix (e.g., 'UPDATE', 'DELETE', 'INSERT')
 * @param allowedPrefixes Additional allowed prefixes (e.g., ['CREATE'] for UPDATE statements)
 * @throws DuckLakeError if the query contains multiple statements or doesn't match expected prefix
 */
function validateSingleStatement(
  query: string,
  expectedPrefix: string,
  allowedPrefixes: string[] = [],
): void {
  const trimmedQuery = query.trim();

  // Check for empty query
  if (!trimmedQuery) {
    throw DuckLakeError.validation('Query cannot be empty');
  }

  // Strip comments (both -- and /* ... */) to properly validate the query structure
  // This ensures that comments cannot be used to hide malicious syntax like statement chaining
  const queryWithoutComments = trimmedQuery.replace(
    /(--[^\n]*)|(\/\*[\s\S]*?\*\/)/g,
    '',
  );

  // Remove trailing semicolon from cleaned query
  const queryStructure = queryWithoutComments.trim();
  const queryWithoutTerminalSemicolon = queryStructure.endsWith(';')
    ? queryStructure.slice(0, -1).trim()
    : queryStructure;

  // Check for multiple statements (semicolons in the middle of the query)
  if (queryWithoutTerminalSemicolon.includes(';')) {
    throw DuckLakeError.validation(
      'Multiple SQL statements are not allowed. Query contains statement chaining.',
    );
  }

  // Validate the query starts with expected prefix
  const normalizedQuery = trimmedQuery.toUpperCase();
  const allAllowedPrefixes = [expectedPrefix, ...allowedPrefixes];
  const startsWithAllowedPrefix = allAllowedPrefixes.some((prefix) =>
    normalizedQuery.startsWith(prefix.toUpperCase()),
  );

  if (!startsWithAllowedPrefix) {
    const prefixList = allAllowedPrefixes.join(' or ');
    throw DuckLakeError.validation(`Query must be a ${prefixList} statement`);
  }

  // Additional check: ensure no suspicious patterns that could indicate injection
  // We check the CLEANED query. If comments were stripped, we are checking the actual executable code.
  // This means standard injection patterns will be visible.
  const suspiciousPatterns = [
    /;\s*--/, // Semicolon followed by comment marker (classic injection artifact)
    /;\s*\/\*/, // Semicolon followed by block comment
    /'\s*OR\s*'/i, // Tautologies
    /"\s*OR\s*"/i,
    /;\s*DROP\s+TABLE/i, // Explicit destructive commands after semicolon
    /;\s*DELETE\s+FROM/i,
    /;\s*UPDATE\s+/i,
    /;\s*INSERT\s+INTO/i,
  ];

  suspiciousPatterns.forEach((pattern) => {
    if (pattern.test(queryWithoutTerminalSemicolon)) {
      throw DuckLakeError.validation(
        'Query contains suspicious patterns that may indicate SQL injection',
      );
    }
  });
}

export default class DuckLakeService {
  private static initialized = false;

  // Track active queries for cancellation
  private static activeQueries = new Map<string, () => void>();

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

      // Allow standard SQL types including arrays (VARCHAR[]), decimals (DECIMAL(10,2)), etc.
      // Pattern: starts with letter/underscore, then letters, numbers, underscores, parens, spaces, commas, brackets
      // eslint-disable-next-line no-useless-escape
      const typePattern = /^[A-Za-z_][A-Za-z0-9_() ,\[\]]*$/;
      if (!typePattern.test(columnType.trim())) {
        throw DuckLakeError.validation('Invalid column type format');
      }

      if (defaultValue) {
        // Conservative pattern for literals: numbers, quoted strings, booleans, NULL
        const defaultPattern =
          /^(-?\d+(\.\d+)?|'([^']|'')*'|NULL|TRUE|FALSE)$/i;
        if (!defaultPattern.test(defaultValue.trim())) {
          throw DuckLakeError.validation('Invalid default value format');
        }
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

      // Allow standard SQL types including arrays (VARCHAR[]), decimals (DECIMAL(10,2)), etc.
      // eslint-disable-next-line no-useless-escape
      const typePattern = /^[A-Za-z_][A-Za-z0-9_() ,\[\]]*$/;
      if (!typePattern.test(newType.trim())) {
        throw DuckLakeError.validation('Invalid column type format');
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

      // Validate query to prevent statement chaining
      validateSingleStatement(updateQuery, 'UPDATE', ['CREATE']);

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

      // Validate query to prevent statement chaining
      validateSingleStatement(deleteQuery, 'DELETE');

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

      // Validate query to prevent statement chaining
      validateSingleStatement(upsertQuery, 'INSERT');

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
        query: sourceQuery,
      });
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
      await this.ensureConnected(instanceId);
      const adapter = await this.getAdapter(instanceId);

      const details = await adapter.getTableDetails(tableName);

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
    const startTime = Date.now();

    try {
      await this.ensureConnected(request.instanceId);
      const adapter = await this.getAdapter(request.instanceId);

      // Validate query (prevent statement chaining)
      // We allow all common prefixes since this is a general query executor
      const allowedPrefixes = [
        'SELECT',
        'WITH',
        'INSERT',
        'UPDATE',
        'DELETE',
        'CREATE',
        'DROP',
        'ALTER',
        'DESCRIBE',
        'PRAGMA',
        'SHOW',
      ];
      validateSingleStatement(
        request.query,
        allowedPrefixes[0],
        allowedPrefixes.slice(1),
      );

      // Register real cancel function if adapter provides one
      if (request.queryId) {
        const cancelFromAdapter =
          typeof (adapter as any).getCancelFn === 'function'
            ? (adapter as any).getCancelFn(request.queryId)
            : undefined;
        if (typeof cancelFromAdapter === 'function') {
          this.activeQueries.set(request.queryId, cancelFromAdapter);
        }
      }

      try {
        // Execute through adapter; support adapters that return { result, cancel }
        const execResult: any = await adapter.executeQuery(request);

        let result: DuckLakeQueryResult;

        if (
          execResult &&
          typeof execResult === 'object' &&
          typeof execResult.cancel === 'function'
        ) {
          if (request.queryId) {
            this.activeQueries.set(request.queryId, execResult.cancel);
          }
          result =
            typeof execResult.result === 'object' && execResult.result
              ? (execResult.result as DuckLakeQueryResult)
              : (execResult as DuckLakeQueryResult);
        } else {
          result = execResult as DuckLakeQueryResult;
        }

        // Determine command type
        const commandType = this.detectCommandType(request.query);

        return {
          ...result,
          duration: Date.now() - startTime,
          isCommand: commandType !== 'SELECT',
          commandType,
        };
      } finally {
        // Cleanup active query tracking
        if (request.queryId) {
          this.activeQueries.delete(request.queryId);
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[DuckLake Service] Query execution failed:', error);
      // eslint-disable-next-line no-console
      console.error(
        '[DuckLake Service] Error stack:',
        error instanceof Error ? error.stack : 'No stack',
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  static async cancelQuery(queryId: string): Promise<void> {
    const cancelFn = this.activeQueries.get(queryId);
    if (cancelFn) {
      cancelFn();
      this.activeQueries.delete(queryId);
    }
  }

  // Schema Extraction (Phase 6)
  static async extractSchema(instanceId: string): Promise<DuckLakeSchemaInfo> {
    try {
      // eslint-disable-next-line no-console
      console.log(
        '[DuckLake Service] extractSchema called for instance:',
        instanceId,
      );

      await this.ensureConnected(instanceId);
      const adapter = await this.getAdapter(instanceId);

      // Query metadata catalog for schemas using DuckLake v0.3 schema
      // Get current snapshot first
      const schemasResult = await adapter.executeQuery({
        instanceId,
        query: `
          WITH current_snapshot AS (
            SELECT COALESCE(MAX(snapshot_id), 0) as snapshot_id
            FROM ducklake_snapshot
          )
          SELECT DISTINCT s.schema_name
          FROM ducklake_schema s
          CROSS JOIN current_snapshot cs
          WHERE cs.snapshot_id >= s.begin_snapshot
            AND (cs.snapshot_id < s.end_snapshot OR s.end_snapshot IS NULL)
          ORDER BY s.schema_name
        `,
        queryId: `schema-${Date.now()}`,
      });

      const schemaNames: string[] =
        schemasResult.data?.map((row: any) => row.schema_name) || [];

      // Fetch tables and columns for all schemas in parallel
      const schemasWithTables = await Promise.all(
        schemaNames.map(async (schemaName) => {
          // Escape single quotes in schema name to prevent SQL injection
          const escapedSchemaName = schemaName.replace(/'/g, "''");

          const tablesResult = await adapter.executeQuery({
            instanceId,
            query: `
              WITH current_snapshot AS (
                SELECT COALESCE(MAX(snapshot_id), 0) as snapshot_id
                FROM ducklake_snapshot
              )
              SELECT
                t.table_name,
                c.column_name,
                c.column_type,
                c.column_order
              FROM ducklake_table t
              JOIN ducklake_schema s ON t.schema_id = s.schema_id
              LEFT JOIN ducklake_column c ON t.table_id = c.table_id
              CROSS JOIN current_snapshot cs
              WHERE s.schema_name = '${escapedSchemaName}'
                AND cs.snapshot_id >= t.begin_snapshot
                AND (cs.snapshot_id < t.end_snapshot OR t.end_snapshot IS NULL)
                AND cs.snapshot_id >= s.begin_snapshot
                AND (cs.snapshot_id < s.end_snapshot OR s.end_snapshot IS NULL)
                AND (c.column_id IS NULL OR (cs.snapshot_id >= c.begin_snapshot AND (cs.snapshot_id < c.end_snapshot OR c.end_snapshot IS NULL)))
              ORDER BY t.table_name, c.column_order
            `,
            queryId: `tables-${Date.now()}`,
          });

          // Group by table
          const tableMap = new Map<string, DuckLakeSchemaTable>();
          tablesResult.data?.forEach((row: any) => {
            if (!tableMap.has(row.table_name)) {
              tableMap.set(row.table_name, {
                name: row.table_name,
                type: 'TABLE', // DuckLake v0.3 doesn't have table_type in ducklake_table
                columns: [],
              });
            }
            if (row.column_name) {
              tableMap.get(row.table_name)?.columns.push({
                name: row.column_name,
                type: row.column_type,
                position: row.column_order,
              });
            }
          });

          return {
            name: schemaName,
            tables: Array.from(tableMap.values()),
          };
        }),
      );

      // Sanitize: Ensure no BigInt values remain in the schema structure
      // This is critical for IPC serialization
      const sanitizeValue = (obj: any): any => {
        if (obj === null || obj === undefined) return obj;

        if (typeof obj === 'bigint') {
          return Number(obj);
        }

        if (Array.isArray(obj)) {
          return obj.map(sanitizeValue);
        }

        if (typeof obj === 'object') {
          const sanitized: any = {};
          // eslint-disable-next-line no-restricted-syntax
          for (const [key, value] of Object.entries(obj)) {
            sanitized[key] = sanitizeValue(value);
          }
          return sanitized;
        }

        return obj;
      };

      const sanitizedSchemas = sanitizeValue(schemasWithTables);

      return {
        schemas: sanitizedSchemas,
        // Add DuckLake-specific functions
        functions: [
          'ducklake_snapshots',
          'ducklake_table_info',
          'ducklake_table_insertions',
          'ducklake_table_deletions',
          'ducklake_table_changes',
        ],
        // Add metadata tables
        systemTables: [
          'ducklake_table',
          'ducklake_schema',
          'ducklake_column',
          'ducklake_snapshot',
          'ducklake_data_file',
          'ducklake_table_stats',
          'ducklake_table_column_stats',
          'ducklake_partition_info',
          'ducklake_partition_column',
          'ducklake_tag',
        ],
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('DuckLake schema extraction failed:', error);
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
        const sessionToken = await SecureStorageService.getCredential(
          `cloud-aws-session-${id}`,
        );
        return {
          secretAccessKey,
          ...(sessionToken && { sessionToken }),
        };
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

  private static detectCommandType(query: string): 'SELECT' | 'DDL' | 'DML' {
    const normalized = query.trim().toUpperCase();

    // DDL operations
    const ddlKeywords = [
      'CREATE TABLE',
      'DROP TABLE',
      'ALTER TABLE',
      'CREATE SCHEMA',
      'DROP SCHEMA',
      'CREATE VIEW',
      'DROP VIEW',
      'RENAME TABLE',
      'TRUNCATE TABLE',
    ];
    if (ddlKeywords.some((kw) => normalized.includes(kw))) {
      return 'DDL';
    }

    // DML operations
    if (
      normalized.startsWith('INSERT') ||
      normalized.startsWith('UPDATE') ||
      normalized.startsWith('DELETE') ||
      normalized.startsWith('UPSERT')
    ) {
      return 'DML';
    }

    // Default to SELECT (includes WITH, SHOW, DESCRIBE, PRAGMA, etc.)
    return 'SELECT';
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
