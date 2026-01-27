import { client } from '../config/client';
import {
  ConnectionInput,
  Project,
  QueryResponseType,
  BigQueryTestResponse,
  ConnectionModel,
} from '../../types/backend';
import { ConfigureConnectionBody, UpdateConnectionBody } from '../../types/ipc';

export const configureConnection = async (
  body: ConfigureConnectionBody,
): Promise<Project> => {
  const { data } = await client.post<ConfigureConnectionBody, Project>(
    'connector:configure',
    body,
  );
  return data;
};

export const updateConnection = async (
  body: UpdateConnectionBody,
): Promise<void> => {
  await client.post<UpdateConnectionBody>('connector:update', body);
};

export const deleteConnection = async (body: string): Promise<void> => {
  await client.post<string>('connector:delete', body);
};

export const testConnection = async (
  body: ConnectionInput,
): Promise<boolean | BigQueryTestResponse> => {
  const { data } = await client.post<
    ConnectionInput,
    boolean | BigQueryTestResponse
  >('connector:test', body);
  return data;
};

export const listConnections = async (): Promise<ConnectionModel[]> => {
  const { data } = await client.get<ConnectionModel[]>('connector:list');
  return data;
};

export const validateConnection = async (
  body: ConnectionInput,
): Promise<{ valid: boolean; error?: string }> => {
  const { data } = await client.post<
    ConnectionInput,
    { valid: boolean; error?: string }
  >('connector:validate', body);
  return data;
};

export const queryData = async (body: {
  connection: ConnectionInput;
  query: string;
  projectName: string;
  queryId?: string;
}): Promise<QueryResponseType> => {
  const { data } = await client.post<
    {
      connection: ConnectionInput;
      query: string;
      projectName: string;
      queryId?: string;
    },
    QueryResponseType
  >('connector:query', body);
  return data;
};

export const cancelQuery = async (queryId: string): Promise<void> => {
  await client.post<string, void>('connector:cancel-query', queryId);
};

export const setConnectionEnvVariable = async (
  key: string,
  value: string,
): Promise<void> => {
  await client.post<{ key: string; value: string }, void>(
    'connector:setConnectionEnvVariable',
    { key, value },
  );
};

export const getConnectionById = async (
  connectionId: string,
): Promise<ConnectionModel | undefined> => {
  const { data } = await client.post<string, ConnectionModel | undefined>(
    'connector:get',
    connectionId,
  );
  return data;
};

/**
 * Extract schema directly from a connection (not project-based)
 */
export const extractSchemaFromConnection = async (
  connectionId: string,
): Promise<{ tables: any[]; error?: string }> => {
  const { data } = await client.post<string, { tables: any[]; error?: string }>(
    'connector:extractSchema',
    connectionId,
  );
  return data;
};

/**
 * Save a query for a specific connection
 */
export const updateConnectionQuery = async (
  connectionId: string,
  query: string,
): Promise<void> => {
  await client.post<{ connectionId: string; query: string }, void>(
    'connector:updateQuery',
    { connectionId, query },
  );
};

/**
 * Get the saved query for a specific connection
 */
export const getConnectionQuery = async (
  connectionId: string,
): Promise<string> => {
  const { data } = await client.post<string, string>(
    'connector:getQuery',
    connectionId,
  );
  return data;
};

/**
 * Execute a query directly using a connection (not project-based)
 */
export const executeQueryForConnection = async (body: {
  connectionId: string;
  query: string;
  queryId?: string;
}): Promise<QueryResponseType> => {
  const { data } = await client.post<
    { connectionId: string; query: string; queryId?: string },
    QueryResponseType
  >('connector:executeQuery', body);
  return data;
};
