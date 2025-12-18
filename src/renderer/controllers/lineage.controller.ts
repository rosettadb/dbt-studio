import {
  useQuery,
  UseQueryOptions,
  useMutation,
  UseMutationOptions,
  UseMutationResult,
} from 'react-query';
import type {
  ColumnLineageRequest,
  ColumnLineageResponse,
  LineageCurrentModelRequest,
  LineageCurrentModelResponse,
  LineageFullGraphRequest,
  LineageGraphResponse,
  LineageModelMetadata,
  LineageTraversalRequest,
} from '../../types/lineage';
import { QUERY_KEYS } from '../config/constants';
import { lineageService } from '../services';

export const useUpstreamLineage = (
  request: LineageTraversalRequest,
  options?: UseQueryOptions<
    LineageGraphResponse,
    unknown,
    LineageGraphResponse
  >,
) => {
  return useQuery({
    queryKey: [
      QUERY_KEYS.GET_LINEAGE_UPSTREAM,
      request.projectId,
      request.modelId,
      request.depth,
    ],
    queryFn: () => lineageService.getUpstreamLineage(request),
    enabled: Boolean(request.modelId),
    ...options,
  });
};

export const useDownstreamLineage = (
  request: LineageTraversalRequest,
  options?: UseQueryOptions<
    LineageGraphResponse,
    unknown,
    LineageGraphResponse
  >,
) => {
  return useQuery({
    queryKey: [
      QUERY_KEYS.GET_LINEAGE_DOWNSTREAM,
      request.projectId,
      request.modelId,
      request.depth,
    ],
    queryFn: () => lineageService.getDownstreamLineage(request),
    enabled: Boolean(request.modelId),
    ...options,
  });
};

export const useFullLineage = (
  request: LineageFullGraphRequest,
  options?: UseQueryOptions<
    LineageGraphResponse,
    unknown,
    LineageGraphResponse
  >,
) => {
  return useQuery({
    queryKey: [
      QUERY_KEYS.GET_LINEAGE_FULL,
      request.projectId,
      request.modelId,
      request.depth,
    ],
    queryFn: () => lineageService.getFullLineage(request),
    enabled: Boolean(request.modelId),
    ...options,
  });
};

export const useLineageModelMetadata = (
  request: LineageTraversalRequest,
  options?: UseQueryOptions<
    LineageModelMetadata | undefined,
    unknown,
    LineageModelMetadata | undefined
  >,
) => {
  return useQuery({
    queryKey: [
      QUERY_KEYS.GET_LINEAGE_METADATA,
      request.projectId,
      request.modelId,
    ],
    queryFn: () => lineageService.getModelMetadata(request),
    enabled: Boolean(request.modelId),
    ...options,
  });
};

export const useCurrentModelId = (
  request: LineageCurrentModelRequest,
  options?: UseQueryOptions<
    LineageCurrentModelResponse,
    unknown,
    LineageCurrentModelResponse
  >,
) => {
  return useQuery({
    queryKey: [
      QUERY_KEYS.GET_LINEAGE_CURRENT_MODEL,
      request.projectId,
      request.filePath,
    ],
    queryFn: () => lineageService.getCurrentModelId(request),
    enabled: Boolean(request.projectId || request.filePath),
    ...options,
  });
};

export const useColumnLineage = (
  options?: UseMutationOptions<
    ColumnLineageResponse,
    unknown,
    ColumnLineageRequest
  >,
): UseMutationResult<ColumnLineageResponse, unknown, ColumnLineageRequest> => {
  const mutation = useMutation({
    mutationFn: (payload: ColumnLineageRequest) =>
      lineageService.getColumnLineage(payload),
    ...options,
  });

  return mutation;
};
