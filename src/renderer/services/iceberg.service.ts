import type { Table } from '../../types/backend';
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
  IcebergTestStorageParams,
  IcebergListStorageBucketsParams,
  IcebergTestResult,
  IcebergSchemaResult,
  IcebergSnapshotInfo,
  IcebergPreviewResult,
  IcebergLocalCatalogResult,
  IcebergCapabilities,
  IcebergImportTableResult,
  IcebergImportFileFormat,
  IcebergTableOperationResult,
  IcebergNamespaceOperationResult,
  IcebergSqlCapability,
  IcebergSqlExecutionParams,
  IcebergSqlExecutionResult,
  IcebergSqlSchemaInfo,
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

export const testIcebergStorage = (
  params: IcebergTestStorageParams,
): Promise<IcebergTestResult> =>
  window.electron.ipcRenderer.invoke('iceberg:testStorage', params);

export const listIcebergStorageBuckets = (
  params: IcebergListStorageBucketsParams,
): Promise<string[]> =>
  window.electron.ipcRenderer.invoke('iceberg:listStorageBuckets', params);

export const testIcebergInstance = (id: string): Promise<IcebergTestResult> =>
  window.electron.ipcRenderer.invoke('iceberg:testInstance', id);

export const getIcebergSqlCapability = (
  id: string,
): Promise<IcebergSqlCapability> =>
  window.electron.ipcRenderer.invoke('iceberg:sqlCapability', id);

export const getIcebergSqlSchema = (
  id: string,
): Promise<IcebergSqlSchemaInfo> =>
  window.electron.ipcRenderer.invoke('iceberg:sqlSchema', id);

export const verifyIcebergSqlAccess = (
  id: string,
): Promise<IcebergTestResult> =>
  window.electron.ipcRenderer.invoke('iceberg:verifySqlAccess', id);

export const executeIcebergSql = (
  params: IcebergSqlExecutionParams,
): Promise<IcebergSqlExecutionResult> =>
  window.electron.ipcRenderer.invoke('iceberg:executeSql', params);

export const cancelIcebergSql = (executionId: string): Promise<boolean> =>
  window.electron.ipcRenderer.invoke('iceberg:cancelSql', executionId);

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
): Promise<IcebergSchemaResult> =>
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

export const importIcebergTable = (
  id: string,
  namespace: string[],
  table: string,
  filePath: string,
  fileFormat: IcebergImportFileFormat,
): Promise<IcebergImportTableResult> =>
  window.electron.ipcRenderer.invoke(
    'iceberg:importTable',
    id,
    namespace,
    table,
    filePath,
    fileFormat,
  );

export const dropIcebergTable = (
  id: string,
  namespace: string[],
  table: string,
): Promise<IcebergTableOperationResult> =>
  window.electron.ipcRenderer.invoke('iceberg:dropTable', id, namespace, table);

export const renameIcebergTable = (
  id: string,
  namespace: string[],
  table: string,
  newTable: string,
): Promise<IcebergTableOperationResult> =>
  window.electron.ipcRenderer.invoke(
    'iceberg:renameTable',
    id,
    namespace,
    table,
    newTable,
  );

export const createIcebergNamespace = (
  id: string,
  namespace: string[],
): Promise<IcebergNamespaceOperationResult> =>
  window.electron.ipcRenderer.invoke('iceberg:createNamespace', id, namespace);

export const dropIcebergNamespace = (
  id: string,
  namespace: string[],
): Promise<IcebergNamespaceOperationResult> =>
  window.electron.ipcRenderer.invoke('iceberg:dropNamespace', id, namespace);

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

/** Preflight and execution use the same main-process policy. Capture SQL once
 * so confirmation cannot accidentally authorize a subsequently edited query. */
export const executeConfirmedIcebergSql = async (
  params: IcebergSqlExecutionParams,
  confirmMutation: (
    statementClass: IcebergSqlExecutionResult['statementClass'],
  ) => boolean,
): Promise<IcebergSqlExecutionResult | undefined> => {
  const request = { ...params };
  const classification = await executeIcebergSql({
    ...request,
    validateOnly: true,
  });
  const mutating = classification.statementClass !== 'select';
  if (mutating && !confirmMutation(classification.statementClass))
    return undefined;
  // Pagination belongs exclusively to result-producing reads. Do not let a
  // SQL Editor page request turn an already-confirmed mutation into a rejected
  // operation in the main process.
  const executionParams = mutating
    ? {
        instanceId: request.instanceId,
        executionId: request.executionId,
        sql: request.sql,
        maxRows: request.maxRows,
      }
    : request;
  return executeIcebergSql({
    ...executionParams,
    validateOnly: false,
    mutationConfirmed: mutating,
  });
};

/** Shared Notebook schema adapter; identifiers stay separate until SQL insertion. */
export const getIcebergNotebookTables = async (
  connectionId: string,
): Promise<Table[]> => {
  const schema = await getIcebergSqlSchema(connectionId.slice(8));
  return schema.namespaces.flatMap((namespace) =>
    namespace.tables.map((table) => ({
      name: table.name,
      schema: namespace.name,
      type: table.type,
      columns: table.columns.map((column) => ({
        name: column.name,
        typeName: column.type,
        type: column.type,
        nullable: true,
        ordinalPosition: column.position,
        primaryKeySequenceId: 0,
        columnDisplaySize: 0,
        scale: 0,
        precision: 0,
        columnProperties: [],
        autoincrement: false,
        primaryKey: false,
      })),
    })),
  );
};
export const icebergQualifiedName = (...parts: string[]) =>
  ['iceberg', ...parts]
    .map((part) =>
      /^[A-Za-z_][A-Za-z0-9_]*$/.test(part)
        ? part
        : `"${part.replace(/"/g, '""')}"`,
    )
    .join('.');
