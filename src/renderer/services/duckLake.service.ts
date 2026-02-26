/**
 * DuckLake Frontend Service
 * Client-side service for communicating with DuckLake backend via IPC
 */

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
  DuckLakeStorageConfig,
  DuckLakeSnapshotParams,
  DuckLakePaginatedResult,
  DuckLakeSchemaInfo,
} from '../../types/duckLake';

export namespace DuckLakeService {
  // Extension Management
  export async function loadExtension(): Promise<void> {
    return window.electron.ipcRenderer.invoke('ducklake:extension:load');
  }

  export async function verifyExtension(): Promise<boolean> {
    return window.electron.ipcRenderer.invoke('ducklake:extension:verify');
  }

  // Instance Management
  export async function listInstances(): Promise<DuckLakeInstance[]> {
    return window.electron.ipcRenderer.invoke('ducklake:instance:list');
  }

  export async function getInstance(id: string): Promise<DuckLakeInstance> {
    return window.electron.ipcRenderer.invoke('ducklake:instance:get', id);
  }

  export async function createInstance(
    request: DuckLakeInstanceCreateRequest,
  ): Promise<DuckLakeInstance> {
    return window.electron.ipcRenderer.invoke(
      'ducklake:instance:create',
      request,
    );
  }

  export async function updateInstance(
    id: string,
    data: DuckLakeInstanceUpdateRequest,
  ): Promise<DuckLakeInstance> {
    return window.electron.ipcRenderer.invoke('ducklake:instance:update', {
      id,
      data,
    });
  }

  export async function deleteInstance(id: string): Promise<void> {
    return window.electron.ipcRenderer.invoke('ducklake:instance:delete', id);
  }

  export async function getInstanceHealth(
    id: string,
  ): Promise<DuckLakeInstanceHealth> {
    return window.electron.ipcRenderer.invoke('ducklake:instance:health', id);
  }

  // Catalog Management
  export async function testCatalogConnection(
    config: DuckLakeCatalogConfig,
  ): Promise<{ success: boolean; error?: string }> {
    return window.electron.ipcRenderer.invoke('ducklake:catalog:test', config);
  }

  // Table Management
  export async function listTables(
    instanceId: string,
  ): Promise<DuckLakeTableInfo[]> {
    const result = await window.electron.ipcRenderer.invoke(
      'ducklake:table:list',
      instanceId,
    );
    return result;
  }

  export async function getTable(
    instanceId: string,
    tableName: string,
  ): Promise<DuckLakeTableInfo> {
    return window.electron.ipcRenderer.invoke(
      'ducklake:table:get',
      instanceId,
      tableName,
    );
  }

  export async function importTable(
    instanceId: string,
    tableName: string,
    sourceQuery: string,
  ): Promise<void> {
    return window.electron.ipcRenderer.invoke(
      'ducklake:table:import',
      instanceId,
      tableName,
      sourceQuery,
    );
  }

  export async function deleteTable(
    instanceId: string,
    tableName: string,
  ): Promise<void> {
    return window.electron.ipcRenderer.invoke(
      'ducklake:table:delete',
      instanceId,
      tableName,
    );
  }

  export async function renameTable(
    instanceId: string,
    oldName: string,
    newName: string,
  ): Promise<void> {
    return window.electron.ipcRenderer.invoke(
      'ducklake:table:rename',
      instanceId,
      oldName,
      newName,
    );
  }

  export async function addColumn(
    instanceId: string,
    tableName: string,
    columnName: string,
    columnType: string,
    defaultValue?: string,
  ): Promise<void> {
    return window.electron.ipcRenderer.invoke(
      'ducklake:table:addColumn',
      instanceId,
      tableName,
      columnName,
      columnType,
      defaultValue,
    );
  }

  export async function dropColumn(
    instanceId: string,
    tableName: string,
    columnName: string,
  ): Promise<void> {
    return window.electron.ipcRenderer.invoke(
      'ducklake:table:dropColumn',
      instanceId,
      tableName,
      columnName,
    );
  }

  export async function renameColumn(
    instanceId: string,
    tableName: string,
    oldColumnName: string,
    newColumnName: string,
  ): Promise<void> {
    return window.electron.ipcRenderer.invoke(
      'ducklake:table:renameColumn',
      instanceId,
      tableName,
      oldColumnName,
      newColumnName,
    );
  }

  export async function alterColumnType(
    instanceId: string,
    tableName: string,
    columnName: string,
    newType: string,
  ): Promise<void> {
    return window.electron.ipcRenderer.invoke(
      'ducklake:table:alterColumnType',
      instanceId,
      tableName,
      columnName,
      newType,
    );
  }

  export async function setPartitionedBy(
    instanceId: string,
    tableName: string,
    columnNames: string[],
  ): Promise<void> {
    return window.electron.ipcRenderer.invoke(
      'ducklake:table:setPartitionedBy',
      instanceId,
      tableName,
      columnNames,
    );
  }

  /**
   * Get comprehensive table details from DuckLake metadata catalog (Phase 8b)
   */
  export async function getTableDetails(
    instanceId: string,
    tableName: string,
  ): Promise<any> {
    const result = await window.electron.ipcRenderer.invoke(
      'ducklake:table:getDetails',
      instanceId,
      tableName,
    );
    return result;
  }

  // Snapshot Management
  export async function listSnapshots(
    instanceId: string,
    tableName: string,
  ): Promise<DuckLakeSnapshotInfo[]> {
    return window.electron.ipcRenderer.invoke(
      'ducklake:snapshot:list',
      instanceId,
      tableName,
    );
  }

  export async function listInstanceSnapshots(
    instanceId: string,
    params?: DuckLakeSnapshotParams,
  ): Promise<DuckLakePaginatedResult<DuckLakeSnapshotDetail>> {
    return window.electron.ipcRenderer.invoke(
      'ducklake:instance:listSnapshots',
      instanceId,
      params,
    );
  }

  export async function restoreSnapshot(
    instanceId: string,
    tableName: string,
    snapshotId: string,
  ): Promise<void> {
    return window.electron.ipcRenderer.invoke(
      'ducklake:snapshot:restore',
      instanceId,
      tableName,
      snapshotId,
    );
  }

  export async function updateRows(
    instanceId: string,
    tableName: string,
    updateQuery: string,
  ): Promise<{ rowsAffected: number }> {
    return window.electron.ipcRenderer.invoke(
      'ducklake:table:updateRows',
      instanceId,
      tableName,
      updateQuery,
    );
  }

  export async function deleteRows(
    instanceId: string,
    tableName: string,
    deleteQuery: string,
  ): Promise<{ rowsAffected: number }> {
    return window.electron.ipcRenderer.invoke(
      'ducklake:table:deleteRows',
      instanceId,
      tableName,
      deleteQuery,
    );
  }

  export async function upsertRows(
    instanceId: string,
    tableName: string,
    upsertQuery: string,
  ): Promise<{ rowsAffected: number }> {
    return window.electron.ipcRenderer.invoke(
      'ducklake:table:upsertRows',
      instanceId,
      tableName,
      upsertQuery,
    );
  }

  // Query Execution
  export async function executeQuery(
    request: DuckLakeQueryRequest,
  ): Promise<DuckLakeQueryResult> {
    return window.electron.ipcRenderer.invoke(
      'ducklake:query:execute',
      request,
    );
  }

  export async function cancelQuery(queryId: string): Promise<void> {
    return window.electron.ipcRenderer.invoke('ducklake:query:cancel', queryId);
  }

  export async function extractSchema(
    instanceId: string,
  ): Promise<DuckLakeSchemaInfo> {
    return window.electron.ipcRenderer.invoke(
      'ducklake:schema:extract',
      instanceId,
    );
  }

  // Maintenance Operations
  export async function optimizeInstance(
    instanceId: string,
    tableName?: string,
  ): Promise<DuckLakeMaintenanceTask> {
    return window.electron.ipcRenderer.invoke(
      'ducklake:maintenance:optimize',
      instanceId,
      tableName,
    );
  }

  export async function vacuumInstance(
    instanceId: string,
    tableName?: string,
  ): Promise<DuckLakeMaintenanceTask> {
    return window.electron.ipcRenderer.invoke(
      'ducklake:maintenance:vacuum',
      instanceId,
      tableName,
    );
  }

  export async function checkpointInstance(
    instanceId: string,
  ): Promise<DuckLakeMaintenanceTask> {
    return window.electron.ipcRenderer.invoke(
      'ducklake:maintenance:checkpoint',
      instanceId,
    );
  }

  export async function getMaintenanceTaskStatus(
    taskId: string,
  ): Promise<DuckLakeMaintenanceTask> {
    return window.electron.ipcRenderer.invoke(
      'ducklake:maintenance:status',
      taskId,
    );
  }

  // Storage Management
  export async function getStorageStats(): Promise<{
    instanceCount: number;
    storageSize: number;
    lastModified: Date;
  }> {
    return window.electron.ipcRenderer.invoke('ducklake:storage:stats');
  }

  export async function validateStorageConnection(
    storageConfig: DuckLakeStorageConfig,
  ): Promise<{ success: boolean; error?: string }> {
    return window.electron.ipcRenderer.invoke(
      'ducklake:storage:validate',
      storageConfig,
    );
  }

  // Cloud Connection Management
  export async function listCloudConnections(): Promise<any[]> {
    return window.electron.ipcRenderer.invoke('ducklake:connection:list');
  }

  export async function getCloudConnection(id: string): Promise<any | null> {
    return window.electron.ipcRenderer.invoke('ducklake:connection:get', id);
  }

  export async function createCloudConnection(connection: any): Promise<any> {
    return window.electron.ipcRenderer.invoke(
      'ducklake:connection:create',
      connection,
    );
  }

  export async function testCloudConnection(
    provider: 'aws' | 'azure' | 'gcs',
    config: any,
  ): Promise<boolean> {
    return window.electron.ipcRenderer.invoke('ducklake:connection:test', {
      provider,
      config,
    });
  }
}
