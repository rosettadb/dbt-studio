/**
 * Iceberg Datalake IPC Handlers
 * Lean wrappers — no business logic, no try/catch, pure delegation.
 * Follows BE-01: IPC handlers are thin wrappers with zero business logic.
 */

import { ipcMain } from 'electron';
import { IcebergDatalakeService } from '../services/icebergDatalake.service';

export const registerIcebergDatalakeHandlers = () => {
  ipcMain.handle('iceberg:getCapabilities', () =>
    IcebergDatalakeService.getCapabilities(),
  );

  ipcMain.handle('iceberg:list', () => IcebergDatalakeService.listInstances());

  ipcMain.handle('iceberg:get', (_e, id: string) =>
    IcebergDatalakeService.getInstance(id),
  );

  ipcMain.handle('iceberg:create', (_e, data) =>
    IcebergDatalakeService.createInstance(data),
  );

  ipcMain.handle('iceberg:update', (_e, id: string, data) =>
    IcebergDatalakeService.updateInstance(id, data),
  );

  ipcMain.handle('iceberg:delete', (_e, id: string) =>
    IcebergDatalakeService.deleteInstance(id),
  );

  ipcMain.handle('iceberg:testCatalog', (_e, params) =>
    IcebergDatalakeService.testCatalogConnection(params),
  );

  ipcMain.handle('iceberg:testStorage', (_e, params) =>
    IcebergDatalakeService.testStorageConnection(params),
  );

  ipcMain.handle('iceberg:listStorageBuckets', (_e, params) =>
    IcebergDatalakeService.listStorageBuckets(params),
  );

  ipcMain.handle('iceberg:testInstance', (_e, id: string) =>
    IcebergDatalakeService.testInstanceConnection(id),
  );

  ipcMain.handle('iceberg:sqlCapability', (_e, id: string) =>
    IcebergDatalakeService.getSqlCapability(id),
  );

  ipcMain.handle('iceberg:sqlSchema', (_e, id: string) =>
    IcebergDatalakeService.getSqlSchema(id),
  );

  ipcMain.handle('iceberg:verifySqlAccess', (_e, id: string) =>
    IcebergDatalakeService.verifySqlAccess(id),
  );

  ipcMain.handle('iceberg:executeSql', (_e, params) =>
    IcebergDatalakeService.executeSql(params),
  );

  ipcMain.handle('iceberg:cancelSql', (_e, executionId: string) =>
    IcebergDatalakeService.cancelSql(executionId),
  );

  ipcMain.handle('iceberg:listNamespaces', (_e, id: string, parent?) =>
    IcebergDatalakeService.listNamespaces(id, parent),
  );

  ipcMain.handle('iceberg:listTables', (_e, id: string, namespace) =>
    IcebergDatalakeService.listTables(id, namespace),
  );

  ipcMain.handle('iceberg:getSchema', (_e, id: string, namespace, table) =>
    IcebergDatalakeService.getTableSchema(id, namespace, table),
  );

  ipcMain.handle('iceberg:getSnapshots', (_e, id: string, namespace, table) =>
    IcebergDatalakeService.getTableSnapshots(id, namespace, table),
  );
  ipcMain.handle(
    'iceberg:previewTable',
    (_e, id: string, namespace, table, limit, filter?) =>
      IcebergDatalakeService.previewTable(id, namespace, table, limit, filter),
  );

  ipcMain.handle(
    'iceberg:importTable',
    (_e, id: string, namespace, table, filePath, fileFormat) =>
      IcebergDatalakeService.importTable(
        id,
        namespace,
        table,
        filePath,
        fileFormat,
      ),
  );

  ipcMain.handle('iceberg:dropTable', (_e, id: string, namespace, table) =>
    IcebergDatalakeService.dropTable(id, namespace, table),
  );

  ipcMain.handle(
    'iceberg:renameTable',
    (_e, id: string, namespace, table, newTable) =>
      IcebergDatalakeService.renameTable(id, namespace, table, newTable),
  );

  ipcMain.handle('iceberg:createNamespace', (_e, id: string, namespace) =>
    IcebergDatalakeService.createNamespace(id, namespace),
  );

  ipcMain.handle('iceberg:dropNamespace', (_e, id: string, namespace) =>
    IcebergDatalakeService.dropNamespace(id, namespace),
  );

  ipcMain.handle('iceberg:createMetadataFile', (_e, warehousePath: string) =>
    IcebergDatalakeService.createMetadataFile(warehousePath),
  );

  ipcMain.handle('iceberg:ensureInstalled', () =>
    IcebergDatalakeService.ensurePyicebergInstalled(),
  );
};
