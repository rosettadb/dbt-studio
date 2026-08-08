/**
 * Iceberg Datalake React Query Controller
 * Provides typed query and mutation hooks for all Iceberg IPC operations.
 * Follows the React Query v3 pattern used throughout the app.
 */

import React from 'react';
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

export const useIcebergCapabilities = () =>
  useQuery(['iceberg', 'capabilities'], icebergService.getIcebergCapabilities, {
    staleTime: Infinity,
  });

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

export const useCreateIcebergMetadataFile = () =>
  useMutation((warehousePath: string) =>
    icebergService.createIcebergMetadataFile(warehousePath),
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

/**
 * FE-05 — Install gate hook.
 * Wraps useMutation side-effect in a dedicated controller hook so components
 * never call `mutate` directly inside a `useEffect`.
 * Has a built-in 5-second timeout so the banner never blocks indefinitely.
 */
export const useEnsureIcebergInstalledOnMount = () => {
  const { mutate, isLoading, data } = useEnsureIcebergInstalled();
  const hasRun = React.useRef(false);
  const [timedOut, setTimedOut] = React.useState(false);

  React.useEffect(() => {
    if (!hasRun.current) {
      hasRun.current = true;
      mutate(undefined, {
        onError: () => {
          // Suppress — install errors are not fatal for the DataLake UI
        },
      });
      // Safety timeout — dismiss banner after 5 seconds regardless
      const timer = setTimeout(() => setTimedOut(true), 5000);
      return () => clearTimeout(timer);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    // Hide banner if timed out or mutation resolved
    isInstalling: isLoading && !timedOut,
    installResult: data,
  };
};
