/**
 * Iceberg Datalake React Query Controller
 * Provides typed query and mutation hooks for all Iceberg IPC operations.
 * Follows the React Query v3 pattern used throughout the app.
 */

import { useMutation, useQuery, useQueryClient } from 'react-query';
import type {
  CreateIcebergInstanceDTO,
  IcebergTestCatalogParams,
} from '../../types/iceberg';
import * as icebergService from '../services/iceberg.service';

// ─────────────────────────────────────────────
//  Queries
// ─────────────────────────────────────────────

export const useListIcebergInstances = () =>
  useQuery(['iceberg', 'list'], icebergService.listIcebergInstances);

export const useGetIcebergInstance = (id: string) =>
  useQuery(
    ['iceberg', 'instance', id],
    () => icebergService.getIcebergInstance(id),
    { enabled: !!id },
  );

export const useListIcebergNamespaces = (id: string, parent?: string[]) =>
  useQuery(
    ['iceberg', 'namespaces', id, parent ?? []],
    () => icebergService.listIcebergNamespaces(id, parent),
    { enabled: !!id },
  );

export const useListIcebergTables = (id: string, namespace: string[]) =>
  useQuery(
    ['iceberg', 'tables', id, namespace],
    () => icebergService.listIcebergTables(id, namespace),
    { enabled: !!id && namespace.length > 0 },
  );

export const useGetIcebergSchema = (
  id: string,
  namespace: string[],
  table: string,
) =>
  useQuery(
    ['iceberg', 'schema', id, namespace, table],
    () => icebergService.getIcebergTableSchema(id, namespace, table),
    { enabled: !!id && !!table },
  );

export const useGetIcebergSnapshots = (
  id: string,
  namespace: string[],
  table: string,
) =>
  useQuery(
    ['iceberg', 'snapshots', id, namespace, table],
    () => icebergService.getIcebergTableSnapshots(id, namespace, table),
    { enabled: !!id && !!table },
  );

// ─────────────────────────────────────────────
//  Mutations
// ─────────────────────────────────────────────

export const useCreateIcebergInstance = () => {
  const qc = useQueryClient();
  return useMutation(
    (data: CreateIcebergInstanceDTO) =>
      icebergService.createIcebergInstance(data),
    {
      onSuccess: () => qc.invalidateQueries(['iceberg', 'list']),
    },
  );
};

export const useUpdateIcebergInstance = () => {
  const qc = useQueryClient();
  return useMutation(
    ({ id, data }: { id: string; data: Partial<CreateIcebergInstanceDTO> }) =>
      icebergService.updateIcebergInstance(id, data),
    {
      onSuccess: (_result, { id }) => {
        qc.invalidateQueries(['iceberg', 'list']);
        qc.invalidateQueries(['iceberg', 'instance', id]);
      },
    },
  );
};

export const useDeleteIcebergInstance = () => {
  const qc = useQueryClient();
  return useMutation((id: string) => icebergService.deleteIcebergInstance(id), {
    onSuccess: () => qc.invalidateQueries(['iceberg', 'list']),
  });
};

export const useTestIcebergCatalog = () =>
  useMutation((params: IcebergTestCatalogParams) =>
    icebergService.testIcebergCatalog(params),
  );

export const usePreviewIcebergTable = () =>
  useMutation(
    ({
      id,
      namespace,
      table,
      limit,
      rowFilter,
    }: {
      id: string;
      namespace: string[];
      table: string;
      limit: number;
      rowFilter?: string;
    }) =>
      icebergService.previewIcebergTable(
        id,
        namespace,
        table,
        limit,
        rowFilter,
      ),
  );

export const useEnsureIcebergInstalled = () =>
  useMutation(() => icebergService.ensureIcebergInstalled());
