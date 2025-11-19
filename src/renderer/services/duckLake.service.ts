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
  DuckLakeQueryRequest,
  DuckLakeQueryResult,
  DuckLakeMaintenanceTask,
  DuckLakeCatalogConfig,
  DuckLakeColumnInfo,
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
  export async function connectToCatalog(instanceId: string): Promise<void> {
    return window.electron.ipcRenderer.invoke(
      'ducklake:catalog:connect',
      instanceId,
    );
  }

  export async function disconnectFromCatalog(
    instanceId: string,
  ): Promise<void> {
    return window.electron.ipcRenderer.invoke(
      'ducklake:catalog:disconnect',
      instanceId,
    );
  }

  export async function testCatalogConnection(
    config: DuckLakeCatalogConfig,
  ): Promise<{ success: boolean; error?: string }> {
    return window.electron.ipcRenderer.invoke('ducklake:catalog:test', config);
  }

  // Table Management
  export async function listTables(
    instanceId: string,
  ): Promise<DuckLakeTableInfo[]> {
    return window.electron.ipcRenderer.invoke(
      'ducklake:table:list',
      instanceId,
    );
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

  export async function createTable(
    instanceId: string,
    tableName: string,
    schema: DuckLakeColumnInfo[],
  ): Promise<void> {
    return window.electron.ipcRenderer.invoke(
      'ducklake:table:create',
      instanceId,
      tableName,
      schema,
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

  // Query Execution
  export async function executeQuery(
    request: DuckLakeQueryRequest,
  ): Promise<DuckLakeQueryResult> {
    return window.electron.ipcRenderer.invoke(
      'ducklake:query:execute',
      request,
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
}
