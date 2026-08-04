import { client } from '../config/client';
import {
  ConnectionInput,
  Project,
  QueryResponseType,
  BigQueryTestResponse,
  ConnectionModel,
  ExecuteConnectionQueryRequest,
} from '../../types/backend';
import {
  ConfigureConnectionBody,
  TestConnectionBody,
  UpdateConnectionBody,
} from '../../types/ipc';

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

export const saveConnection = async (
  connection: ConnectionInput,
): Promise<string> => {
  const { data } = await client.post<ConnectionInput, string>(
    'connector:save',
    connection,
  );
  return data;
};

export const testConnection = async (
  body: TestConnectionBody,
): Promise<boolean | BigQueryTestResponse> => {
  const { data } = await client.post<
    TestConnectionBody,
    boolean | BigQueryTestResponse
  >('connector:test', body);
  return data;
};

export const listConnections = async (
  includeDataLake?: boolean,
): Promise<ConnectionModel[]> => {
  const { data } = await client.post<boolean | undefined, ConnectionModel[]>(
    'connector:list',
    includeDataLake,
  );
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
  limit?: number;
}): Promise<QueryResponseType> => {
  const { data } = await client.post<
    {
      connection: ConnectionInput;
      query: string;
      projectName: string;
      queryId?: string;
      limit?: number;
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
  forceRefresh = false,
): Promise<{ tables: any[]; error?: string }> => {
  const { data } = await client.post<
    { connectionId: string; forceRefresh?: boolean },
    { tables: any[]; error?: string }
  >('connector:extractSchema', { connectionId, forceRefresh });
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
export const executeQueryForConnection = async (
  body: ExecuteConnectionQueryRequest,
): Promise<QueryResponseType> => {
  const { data } = await client.post<
    ExecuteConnectionQueryRequest,
    QueryResponseType
  >('connector:executeQuery', body);
  return data;
};
