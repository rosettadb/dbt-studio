/**
 * DuckLake IPC Handlers
 * Thin wrapper handlers following Electron 7-step command flow
 * All business logic is delegated to DuckLakeService
 */

import { ipcMain } from 'electron';
import DuckLakeService from '../services/duckLake.service';
import {
  DuckLakeInstanceCreateRequest,
  DuckLakeInstanceUpdateRequest,
  DuckLakeCatalogConfig,
  DuckLakeQueryRequest,
  DuckLakeStorageConfig,
} from '../../types/duckLake';

const registerDuckLakeHandlers = () => {
  // Instance Management Handlers
  ipcMain.handle('ducklake:instance:list', async () => {
    return DuckLakeService.listInstances();
  });

  ipcMain.handle('ducklake:instance:get', async (_event, id: string) => {
    return DuckLakeService.getInstance(id);
  });

  ipcMain.handle(
    'ducklake:instance:create',
    async (_event, request: DuckLakeInstanceCreateRequest) => {
      return DuckLakeService.createInstance(request);
    },
  );

  ipcMain.handle(
    'ducklake:instance:update',
    async (
      _event,
      request: { id: string; data: DuckLakeInstanceUpdateRequest },
    ) => {
      return DuckLakeService.updateInstance(request.id, request.data);
    },
  );

  ipcMain.handle('ducklake:instance:delete', async (_event, id: string) => {
    return DuckLakeService.deleteInstance(id);
  });

  ipcMain.handle('ducklake:instance:health', async (_event, id: string) => {
    return DuckLakeService.getInstanceHealth(id);
  });

  // Catalog Management Handlers
  ipcMain.handle(
    'ducklake:catalog:test',
    async (_event, config: DuckLakeCatalogConfig) => {
      return DuckLakeService.testCatalogConnection(config);
    },
  );

  // Table Management Handlers
  ipcMain.handle('ducklake:table:list', async (_event, instanceId: string) => {
    return DuckLakeService.listTables(instanceId);
  });

  ipcMain.handle(
    'ducklake:table:get',
    async (_event, instanceId: string, tableName: string) => {
      return DuckLakeService.getTable(instanceId, tableName);
    },
  );

  ipcMain.handle(
    'ducklake:table:import',
    async (
      _event,
      instanceId: string,
      tableName: string,
      sourceQuery: string,
    ) => {
      return DuckLakeService.importTable(instanceId, tableName, sourceQuery);
    },
  );

  ipcMain.handle(
    'ducklake:table:delete',
    async (_event, instanceId: string, tableName: string) => {
      return DuckLakeService.deleteTable(instanceId, tableName);
    },
  );

  // Phase 8b: Table Details Handler
  ipcMain.handle(
    'ducklake:table:getDetails',
    async (_event, instanceId: string, tableName: string) => {
      return DuckLakeService.getTableDetails(instanceId, tableName);
    },
  );

  // Snapshot Management Handlers
  ipcMain.handle(
    'ducklake:snapshot:list',
    async (_event, instanceId: string, tableName: string) => {
      return DuckLakeService.listSnapshots(instanceId, tableName);
    },
  );

  ipcMain.handle(
    'ducklake:instance:listSnapshots',
    async (_event, instanceId: string, params: any) => {
      console.log(
        '[DuckLake IPC] Handling ducklake:instance:listSnapshots for:',
        instanceId,
        params,
      );
      // Ensure params has defaults if missing (though Service also defaults)
      const listParams = params || { page: 1, pageSize: 100 };
      return DuckLakeService.listInstanceSnapshots(instanceId, listParams);
    },
  );

  ipcMain.handle(
    'ducklake:snapshot:restore',
    async (
      _event,
      instanceId: string,
      tableName: string,
      snapshotId: string,
    ) => {
      return DuckLakeService.restoreSnapshot(instanceId, tableName, snapshotId);
    },
  );

  // Query Execution Handlers
  ipcMain.handle(
    'ducklake:query:execute',
    async (_event, request: DuckLakeQueryRequest) => {
      return DuckLakeService.executeQuery(request);
    },
  );

  // Maintenance Operation Handlers
  ipcMain.handle(
    'ducklake:maintenance:optimize',
    async (_event, instanceId: string, tableName?: string) => {
      return DuckLakeService.startMaintenanceTask(
        instanceId,
        'optimize',
        tableName,
      );
    },
  );

  ipcMain.handle(
    'ducklake:maintenance:vacuum',
    async (_event, instanceId: string, tableName?: string) => {
      return DuckLakeService.startMaintenanceTask(
        instanceId,
        'vacuum',
        tableName,
      );
    },
  );

  ipcMain.handle(
    'ducklake:maintenance:checkpoint',
    async (_event, instanceId: string) => {
      return DuckLakeService.startMaintenanceTask(instanceId, 'checkpoint');
    },
  );

  ipcMain.handle(
    'ducklake:maintenance:status',
    async (_event, taskId: string) => {
      return DuckLakeService.getMaintenanceTaskStatus(taskId);
    },
  );

  // Extension Management Handlers
  ipcMain.handle('ducklake:extension:load', async () => {
    return DuckLakeService.loadDuckLakeExtension();
  });

  ipcMain.handle('ducklake:extension:verify', async () => {
    return DuckLakeService.verifyExtension();
  });

  // Storage Management Handlers
  ipcMain.handle('ducklake:storage:stats', async () => {
    return DuckLakeService.getStorageStats();
  });

  ipcMain.handle(
    'ducklake:storage:validate',
    async (_event, storageConfig: DuckLakeStorageConfig) => {
      return DuckLakeService.validateStorageConnection(storageConfig);
    },
  );

  // Cloud Connection Management Handlers
  ipcMain.handle('ducklake:connection:list', async () => {
    const ConnectorsService = (await import('../services/connectors.service'))
      .default;
    return ConnectorsService.loadCloudConnections();
  });

  ipcMain.handle('ducklake:connection:get', async (_event, id: string) => {
    const ConnectorsService = (await import('../services/connectors.service'))
      .default;
    return ConnectorsService.getCloudConnectionById(id);
  });

  ipcMain.handle(
    'ducklake:connection:create',
    async (_event, connection: any) => {
      const ConnectorsService = (await import('../services/connectors.service'))
        .default;
      await ConnectorsService.saveCloudConnection(connection);
      return connection;
    },
  );

  ipcMain.handle(
    'ducklake:connection:test',
    async (
      _event,
      params: { provider: 'aws' | 'azure' | 'gcs'; config: any },
    ) => {
      const CloudExplorerService = (
        await import('../services/cloudExplorer.service')
      ).default;
      return CloudExplorerService.testConnection(
        params.provider,
        params.config,
      );
    },
  );
};

export default registerDuckLakeHandlers;
