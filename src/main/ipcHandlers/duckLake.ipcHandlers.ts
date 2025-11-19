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
  DuckLakeColumnInfo,
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
    'ducklake:catalog:connect',
    async (_event, instanceId: string) => {
      return DuckLakeService.connectToCatalog(instanceId);
    },
  );

  ipcMain.handle(
    'ducklake:catalog:disconnect',
    async (_event, instanceId: string) => {
      return DuckLakeService.disconnectFromCatalog(instanceId);
    },
  );

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
    'ducklake:table:create',
    async (
      _event,
      instanceId: string,
      tableName: string,
      schema: DuckLakeColumnInfo[],
    ) => {
      return DuckLakeService.createTable(instanceId, tableName, schema);
    },
  );

  ipcMain.handle(
    'ducklake:table:delete',
    async (_event, instanceId: string, tableName: string) => {
      return DuckLakeService.deleteTable(instanceId, tableName);
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
};

export default registerDuckLakeHandlers;
