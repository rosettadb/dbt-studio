/**
 * Iceberg Datalake IPC Handlers
 * Lean wrappers — no business logic, no try/catch, pure delegation.
 * Follows BE-01: IPC handlers are thin wrappers with zero business logic.
 */

import { ipcMain } from 'electron';
import { IcebergDatalakeService } from '../services/icebergDatalake.service';

export const registerIcebergDatalakeHandlers = () => {
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

  ipcMain.handle('iceberg:createMetadataFile', (_e, warehousePath: string) =>
    IcebergDatalakeService.createMetadataFile(warehousePath),
  );

  ipcMain.handle('iceberg:ensureInstalled', () =>
    IcebergDatalakeService.ensurePyicebergInstalled(),
  );
};
