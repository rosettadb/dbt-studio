import {
  CliUpdateResponseType,
  FileDialogProperties,
  SettingsType,
} from '../../types/backend';
import { client } from '../config/client';

export const getSettings = async (): Promise<SettingsType> => {
  const { data } = await client.get<SettingsType>('settings:load');
  return data;
};

export const updateSettings = async (settings: SettingsType): Promise<void> => {
  await client.post<SettingsType>('settings:save', settings);
};

export const getFilePaths = async (body: {
  properties: FileDialogProperties[];
  defaultPath?: string;
}): Promise<string[]> => {
  const { data } = await client.post<
    { properties: FileDialogProperties[]; defaultPath?: string },
    string[]
  >('settings:dialog', body);
  return data;
};

export const checkCliUpdate = async (): Promise<CliUpdateResponseType> => {
  const { data } = await client.get<CliUpdateResponseType>(
    'settings:checkCliUpdates',
  );
  return data;
};

export const updateCli = async (
  cliKey: 'dbt' | 'rosetta',
): Promise<CliUpdateResponseType> => {
  const { data } = await client.post<string, CliUpdateResponseType>(
    'settings:updateCli',
    cliKey,
  );
  return data;
};

export const getDbtPath = async (): Promise<string> => {
  const { data } = await client.get<string>('settings:getDbtPath');
  return data;
};

export const createVenv = async (): Promise<void> => {
  await client.get('settings:createVenv');
};

export const usePathJoin = async (...body: string[]): Promise<string> => {
  const { data } = await client.post<string[], string>(
    'settings:usePathJoin',
    body,
  );
  return data;
};
