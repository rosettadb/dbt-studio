/**
 * Iceberg renderer service
 * Named exports wrapping window.electron.ipcRenderer.invoke — no default exports.
 * Follows the renderer service naming pattern (import * as icebergService).
 */

import type {
  CreateIcebergInstanceDTO,
  IcebergInstanceListItem,
  IcebergInstanceConfig,
  IcebergTestCatalogParams,
  IcebergTestResult,
  IcebergFieldSpec,
  IcebergSnapshotInfo,
  IcebergPreviewResult,
  IcebergLocalCatalogResult,
  IcebergCapabilities,
} from '../../types/iceberg';

export const getIcebergCapabilities = (): Promise<IcebergCapabilities> =>
  window.electron.ipcRenderer.invoke('iceberg:getCapabilities');

export const listIcebergInstances = (): Promise<IcebergInstanceListItem[]> =>
  window.electron.ipcRenderer.invoke('iceberg:list');

export const getIcebergInstance = (
  id: string,
): Promise<IcebergInstanceConfig> =>
  window.electron.ipcRenderer.invoke('iceberg:get', id);

export const createIcebergInstance = (
  data: CreateIcebergInstanceDTO,
): Promise<IcebergInstanceConfig> =>
  window.electron.ipcRenderer.invoke('iceberg:create', data);

export const updateIcebergInstance = (
  id: string,
  data: Partial<CreateIcebergInstanceDTO>,
): Promise<IcebergInstanceConfig> =>
  window.electron.ipcRenderer.invoke('iceberg:update', id, data);

export const deleteIcebergInstance = (id: string): Promise<void> =>
  window.electron.ipcRenderer.invoke('iceberg:delete', id);

export const testIcebergCatalog = (
  params: IcebergTestCatalogParams,
): Promise<IcebergTestResult> =>
  window.electron.ipcRenderer.invoke('iceberg:testCatalog', params);

export const listIcebergNamespaces = (
  id: string,
  parent?: string[],
): Promise<string[][]> =>
  window.electron.ipcRenderer.invoke('iceberg:listNamespaces', id, parent);

export const listIcebergTables = (
  id: string,
  namespace: string[],
): Promise<string[]> =>
  window.electron.ipcRenderer.invoke('iceberg:listTables', id, namespace);

export const getIcebergTableSchema = (
  id: string,
  namespace: string[],
  table: string,
): Promise<IcebergFieldSpec[]> =>
  window.electron.ipcRenderer.invoke('iceberg:getSchema', id, namespace, table);

export const getIcebergTableSnapshots = (
  id: string,
  namespace: string[],
  table: string,
): Promise<IcebergSnapshotInfo[]> =>
  window.electron.ipcRenderer.invoke(
    'iceberg:getSnapshots',
    id,
    namespace,
    table,
  );

export const previewIcebergTable = (
  id: string,
  namespace: string[],
  table: string,
  limit: number,
  rowFilter?: string,
): Promise<IcebergPreviewResult> =>
  window.electron.ipcRenderer.invoke(
    'iceberg:previewTable',
    id,
    namespace,
    table,
    limit,
    rowFilter,
  );

export const createIcebergMetadataFile = (
  warehousePath: string,
): Promise<IcebergLocalCatalogResult> =>
  window.electron.ipcRenderer.invoke(
    'iceberg:createMetadataFile',
    warehousePath,
  );

export const ensureIcebergInstalled = (): Promise<{
  installed: boolean;
  version?: string;
}> => window.electron.ipcRenderer.invoke('iceberg:ensureInstalled');
