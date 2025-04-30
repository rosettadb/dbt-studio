import { client } from '../config/client';
import {
  ConnectionInput,
  Project,
  QueryResponseType,
} from '../../types/backend';
import { ConfigureConnectionBody } from '../../types/ipc';

export const configureConnection = async (
  body: ConfigureConnectionBody,
): Promise<Project> => {
  const { data } = await client.post<ConfigureConnectionBody, Project>(
    'connector:configure',
    body,
  );
  return data;
};

export const testConnection = async (
  body: ConnectionInput,
): Promise<boolean> => {
  const { data } = await client.post<ConnectionInput, boolean>(
    'connector:test',
    body,
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

export const generateJdbcUrl = async (
  body: ConnectionInput,
): Promise<string> => {
  const { data } = await client.post<ConnectionInput, string>(
    'connector:getJdbcUrl',
    body,
  );
  return data;
};

export const queryData = async (body: {
  connection: ConnectionInput;
  query: string;
}): Promise<QueryResponseType> => {
  const { data } = await client.post<
    { connection: ConnectionInput; query: string },
    QueryResponseType
  >('connector:query', body);
  return data;
};
