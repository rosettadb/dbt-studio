/**
 * DuckLake Frontend Service
 * Client-side service for communicating with DuckLake backend via IPC
 */

import { client } from '../config/client';
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
  DuckLakeViewInfo,
  DuckLakeColumnInfo,
} from '../../types/duckLake';

export namespace DuckLakeService {
  // Extension Management
  export async function loadExtension(): Promise<void> {
    const { data } = await client.get<void>('ducklake:extension:load');
    return data;
  }

  export async function verifyExtension(): Promise<boolean> {
    const { data } = await client.get<boolean>('ducklake:extension:verify');
    return data;
  }

  // Instance Management
  export async function listInstances(): Promise<DuckLakeInstance[]> {
    const { data } = await client.get<DuckLakeInstance[]>(
      'ducklake:instance:list',
    );
    return data;
  }

  export async function getInstance(id: string): Promise<DuckLakeInstance> {
    const { data } = await client.post<string, DuckLakeInstance>(
      'ducklake:instance:get',
      id,
    );
    return data;
  }

  export async function createInstance(
    request: DuckLakeInstanceCreateRequest,
  ): Promise<DuckLakeInstance> {
    const { data } = await client.post<
      DuckLakeInstanceCreateRequest,
      DuckLakeInstance
    >('ducklake:instance:create', request);
    return data;
  }

  export async function updateInstance(
    id: string,
    updateData: DuckLakeInstanceUpdateRequest,
  ): Promise<DuckLakeInstance> {
    const { data } = await client.post<
      { id: string; data: DuckLakeInstanceUpdateRequest },
      DuckLakeInstance
    >('ducklake:instance:update', {
      id,
      data: updateData,
    });
    return data;
  }

  export async function deleteInstance(id: string): Promise<void> {
    const { data } = await client.post<string, void>(
      'ducklake:instance:delete',
      id,
    );
    return data;
  }

  export async function getInstanceHealth(
    id: string,
  ): Promise<DuckLakeInstanceHealth> {
    const { data } = await client.post<string, DuckLakeInstanceHealth>(
      'ducklake:instance:health',
      id,
    );
    return data;
  }

  // Catalog Management
  export async function testCatalogConnection(
    config: DuckLakeCatalogConfig,
  ): Promise<{ success: boolean; error?: string }> {
    const { data } = await client.post<
      DuckLakeCatalogConfig,
      { success: boolean; error?: string }
    >('ducklake:catalog:test', config);
    return data;
  }

  // Table Management
  export async function listTables(
    instanceId: string,
  ): Promise<DuckLakeTableInfo[]> {
    const { data } = await client.post<string, DuckLakeTableInfo[]>(
      'ducklake:table:list',
      instanceId,
    );
    return data;
  }

  export async function getTable(
    instanceId: string,
    tableName: string,
  ): Promise<DuckLakeTableInfo> {
    const { data } = await client.post<
      { instanceId: string; tableName: string },
      DuckLakeTableInfo
    >('ducklake:table:get', { instanceId, tableName });
    return data;
  }

  export async function importTable(
    instanceId: string,
    tableName: string,
    sourceQuery: string,
  ): Promise<void> {
    const { data } = await client.post<
      { instanceId: string; tableName: string; sourceQuery: string },
      void
    >('ducklake:table:import', { instanceId, tableName, sourceQuery });
    return data;
  }

  export async function deleteTable(
    instanceId: string,
    tableName: string,
  ): Promise<void> {
    const { data } = await client.post<
      { instanceId: string; tableName: string },
      void
    >('ducklake:table:delete', { instanceId, tableName });
    return data;
  }

  export async function renameTable(
    instanceId: string,
    oldName: string,
    newName: string,
  ): Promise<void> {
    const { data } = await client.post<
      { instanceId: string; oldName: string; newName: string },
      void
    >('ducklake:table:rename', { instanceId, oldName, newName });
    return data;
  }

  export async function addColumn(
    instanceId: string,
    tableName: string,
    columnName: string,
    columnType: string,
    defaultValue?: string,
  ): Promise<void> {
    const { data } = await client.post<
      {
        instanceId: string;
        tableName: string;
        columnName: string;
        columnType: string;
        defaultValue?: string;
      },
      void
    >('ducklake:table:addColumn', {
      instanceId,
      tableName,
      columnName,
      columnType,
      defaultValue,
    });
    return data;
  }

  export async function dropColumn(
    instanceId: string,
    tableName: string,
    columnName: string,
  ): Promise<void> {
    const { data } = await client.post<
      { instanceId: string; tableName: string; columnName: string },
      void
    >('ducklake:table:dropColumn', { instanceId, tableName, columnName });
    return data;
  }

  export async function renameColumn(
    instanceId: string,
    tableName: string,
    oldColumnName: string,
    newColumnName: string,
  ): Promise<void> {
    const { data } = await client.post<
      {
        instanceId: string;
        tableName: string;
        oldColumnName: string;
        newColumnName: string;
      },
      void
    >('ducklake:table:renameColumn', {
      instanceId,
      tableName,
      oldColumnName,
      newColumnName,
    });
    return data;
  }

  export async function alterColumnType(
    instanceId: string,
    tableName: string,
    columnName: string,
    newType: string,
  ): Promise<void> {
    const { data } = await client.post<
      {
        instanceId: string;
        tableName: string;
        columnName: string;
        newType: string;
      },
      void
    >('ducklake:table:alterColumnType', {
      instanceId,
      tableName,
      columnName,
      newType,
    });
    return data;
  }

  export async function setPartitionedBy(
    instanceId: string,
    tableName: string,
    columnNames: string[],
  ): Promise<void> {
    const { data } = await client.post<
      { instanceId: string; tableName: string; columnNames: string[] },
      void
    >('ducklake:table:setPartitionedBy', {
      instanceId,
      tableName,
      columnNames,
    });
    return data;
  }

  /**
   * Get comprehensive table details from DuckLake metadata catalog (Phase 8b)
   */
  export async function getTableDetails(
    instanceId: string,
    tableName: string,
  ): Promise<any> {
    const { data } = await client.post<
      { instanceId: string; tableName: string },
      any
    >('ducklake:table:getDetails', { instanceId, tableName });
    return data;
  }

  // Snapshot Management
  export async function listSnapshots(
    instanceId: string,
    tableName: string,
  ): Promise<DuckLakeSnapshotInfo[]> {
    const { data } = await client.post<
      { instanceId: string; tableName: string },
      DuckLakeSnapshotInfo[]
    >('ducklake:snapshot:list', { instanceId, tableName });
    return data;
  }

  export async function listInstanceSnapshots(
    instanceId: string,
    params?: DuckLakeSnapshotParams,
  ): Promise<DuckLakePaginatedResult<DuckLakeSnapshotDetail>> {
    const { data } = await client.post<
      { instanceId: string; params?: DuckLakeSnapshotParams },
      DuckLakePaginatedResult<DuckLakeSnapshotDetail>
    >('ducklake:instance:listSnapshots', { instanceId, params });
    return data;
  }

  export async function restoreSnapshot(
    instanceId: string,
    tableName: string,
    snapshotId: string,
  ): Promise<void> {
    const { data } = await client.post<
      { instanceId: string; tableName: string; snapshotId: string },
      void
    >('ducklake:snapshot:restore', { instanceId, tableName, snapshotId });
    return data;
  }

  // View Management (Plan 25)
  export async function listViews(
    instanceId: string,
  ): Promise<DuckLakeViewInfo[]> {
    return window.electron.ipcRenderer.invoke('ducklake:view:list', instanceId);
  }

  export async function getViewSchema(
    instanceId: string,
    schemaName: string,
    viewName: string,
  ): Promise<DuckLakeColumnInfo[]> {
    return window.electron.ipcRenderer.invoke(
      'ducklake:view:getSchema',
      instanceId,
      schemaName,
      viewName,
    );
  }

  export async function updateRows(
    instanceId: string,
    tableName: string,
    updateQuery: string,
  ): Promise<{ rowsAffected: number }> {
    const { data } = await client.post<
      { instanceId: string; tableName: string; updateQuery: string },
      { rowsAffected: number }
    >('ducklake:table:updateRows', { instanceId, tableName, updateQuery });
    return data;
  }

  export async function deleteRows(
    instanceId: string,
    tableName: string,
    deleteQuery: string,
  ): Promise<{ rowsAffected: number }> {
    const { data } = await client.post<
      { instanceId: string; tableName: string; deleteQuery: string },
      { rowsAffected: number }
    >('ducklake:table:deleteRows', { instanceId, tableName, deleteQuery });
    return data;
  }

  export async function upsertRows(
    instanceId: string,
    tableName: string,
    upsertQuery: string,
  ): Promise<{ rowsAffected: number }> {
    const { data } = await client.post<
      { instanceId: string; tableName: string; upsertQuery: string },
      { rowsAffected: number }
    >('ducklake:table:upsertRows', { instanceId, tableName, upsertQuery });
    return data;
  }

  // Query Execution
  export async function executeQuery(
    request: DuckLakeQueryRequest,
  ): Promise<DuckLakeQueryResult> {
    const { data } = await client.post<
      DuckLakeQueryRequest,
      DuckLakeQueryResult
    >('ducklake:query:execute', request);
    return data;
  }

  export async function cancelQuery(queryId: string): Promise<void> {
    const { data } = await client.post<string, void>(
      'ducklake:query:cancel',
      queryId,
    );
    return data;
  }

  export async function extractSchema(
    instanceId: string,
  ): Promise<DuckLakeSchemaInfo> {
    const { data } = await client.post<string, DuckLakeSchemaInfo>(
      'ducklake:schema:extract',
      instanceId,
    );
    return data;
  }

  // Maintenance Operations
  export async function optimizeInstance(
    instanceId: string,
    tableName?: string,
  ): Promise<DuckLakeMaintenanceTask> {
    const { data } = await client.post<
      { instanceId: string; tableName?: string },
      DuckLakeMaintenanceTask
    >('ducklake:maintenance:optimize', { instanceId, tableName });
    return data;
  }

  export async function vacuumInstance(
    instanceId: string,
    tableName?: string,
  ): Promise<DuckLakeMaintenanceTask> {
    const { data } = await client.post<
      { instanceId: string; tableName?: string },
      DuckLakeMaintenanceTask
    >('ducklake:maintenance:vacuum', { instanceId, tableName });
    return data;
  }

  export async function checkpointInstance(
    instanceId: string,
  ): Promise<DuckLakeMaintenanceTask> {
    const { data } = await client.post<string, DuckLakeMaintenanceTask>(
      'ducklake:maintenance:checkpoint',
      instanceId,
    );
    return data;
  }

  export async function getMaintenanceTaskStatus(
    taskId: string,
  ): Promise<DuckLakeMaintenanceTask> {
    const { data } = await client.post<string, DuckLakeMaintenanceTask>(
      'ducklake:maintenance:status',
      taskId,
    );
    return data;
  }

  // Storage Management
  export async function getStorageStats(): Promise<{
    instanceCount: number;
    storageSize: number;
    lastModified: Date;
  }> {
    const { data } = await client.get<{
      instanceCount: number;
      storageSize: number;
      lastModified: Date;
    }>('ducklake:storage:stats');
    return data;
  }

  export async function validateStorageConnection(
    storageConfig: DuckLakeStorageConfig,
  ): Promise<{ success: boolean; error?: string }> {
    const { data } = await client.post<
      DuckLakeStorageConfig,
      { success: boolean; error?: string }
    >('ducklake:storage:validate', storageConfig);
    return data;
  }

  // Cloud Connection Management
  export async function listCloudConnections(): Promise<any[]> {
    const { data } = await client.get<any[]>('ducklake:connection:list');
    return data;
  }

  export async function getCloudConnection(id: string): Promise<any | null> {
    const { data } = await client.post<string, any | null>(
      'ducklake:connection:get',
      id,
    );
    return data;
  }

  export async function createCloudConnection(connection: any): Promise<any> {
    const { data } = await client.post<any, any>(
      'ducklake:connection:create',
      connection,
    );
    return data;
  }

  export async function testCloudConnection(
    provider: 'aws' | 'azure' | 'gcs',
    config: any,
  ): Promise<boolean> {
    const { data } = await client.post<
      { provider: 'aws' | 'azure' | 'gcs'; config: any },
      boolean
    >('ducklake:connection:test', {
      provider,
      config,
    });
    return data;
  }

  // Connection Lifecycle Management
  export async function acquireConnection(instanceId: string): Promise<void> {
    const { data } = await client.post<string, void>(
      'ducklake:connection:acquire',
      instanceId,
    );
    return data;
  }

  export async function releaseConnection(instanceId: string): Promise<void> {
    const { data } = await client.post<string, void>(
      'ducklake:connection:release',
      instanceId,
    );
    return data;
  }
}
