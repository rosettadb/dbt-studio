import { client } from '../config/client';
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

export const getUpstreamLineage = async (
  request: LineageTraversalRequest,
): Promise<LineageGraphResponse> => {
  const { data } = await client.post<
    LineageTraversalRequest,
    LineageGraphResponse
  >('lineage:getUpstream', request);
  return data;
};

export const getDownstreamLineage = async (
  request: LineageTraversalRequest,
): Promise<LineageGraphResponse> => {
  const { data } = await client.post<
    LineageTraversalRequest,
    LineageGraphResponse
  >('lineage:getDownstream', request);
  return data;
};

export const getFullLineage = async (
  request: LineageFullGraphRequest,
): Promise<LineageGraphResponse> => {
  const { data } = await client.post<
    LineageFullGraphRequest,
    LineageGraphResponse
  >('lineage:getFullLineage', request);
  return data;
};

export const getModelMetadata = async (
  request: LineageTraversalRequest,
): Promise<LineageModelMetadata | undefined> => {
  const { data } = await client.post<
    LineageTraversalRequest,
    LineageModelMetadata | undefined
  >('lineage:getModelMetadata', request);
  return data;
};

export const getCurrentModelId = async (
  request: LineageCurrentModelRequest,
): Promise<LineageCurrentModelResponse> => {
  const { data } = await client.post<
    LineageCurrentModelRequest,
    LineageCurrentModelResponse
  >('lineage:getCurrentModelId', request);
  return data;
};

export const getColumnLineage = async (
  request: ColumnLineageRequest,
): Promise<ColumnLineageResponse> => {
  const { data } = await client.post<
    ColumnLineageRequest,
    ColumnLineageResponse
  >('lineage:getColumnLineage', request);
  return data;
};

export const lineageService = {
  getUpstreamLineage,
  getDownstreamLineage,
  getFullLineage,
  getModelMetadata,
  getCurrentModelId,
  getColumnLineage,
};
