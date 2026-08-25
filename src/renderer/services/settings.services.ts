import {
  CliUpdateResponseType,
  FileDialogProperties,
  SettingsType,
  RosettaVersionInfo,
  RunnerVersionInfo,
  RunnerPluginStatus,
  InstallResult,
  PythonInstallInfo,
  PythonVersionInfo,
} from '../../types/backend';
import { client } from '../config/client';
import { SecureStorageAccount } from '../../types/frontend';

export const getSettings = async (): Promise<SettingsType> => {
  const { data } = await client.get<SettingsType>('settings:load');
  return data;
};

export const getSettingsWithDatabaseInfo = async (): Promise<SettingsType> => {
  const { data } = await client.get<SettingsType>('settings:load-with-db-info');
  return data;
};

export const updateSettings = async (settings: SettingsType): Promise<void> => {
  await client.post<SettingsType>('settings:save', settings);
};

export const getFilePaths = async (body: {
  properties: FileDialogProperties[];
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
}): Promise<string[]> => {
  const { data } = await client.post<
    {
      properties: FileDialogProperties[];
      defaultPath?: string;
      filters?: { name: string; extensions: string[] }[];
    },
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

export const usePathJoin = async (...body: string[]): Promise<string> => {
  const { data } = await client.post<string[], string>(
    'settings:usePathJoin',
    body,
  );
  return data;
};

export const pathJoin = async (...body: string[]): Promise<string> => {
  const { data } = await client.post<string[], string>(
    'settings:usePathJoin',
    body,
  );
  return data;
};

export const getFileName = async (...body: string[]): Promise<string> => {
  const { data } = await client.post<string[], string>(
    'settings:getFileName',
    body,
  );
  return data;
};

export const getBasename = async (filePath: string): Promise<string> => {
  const { data } = await client.post<string, string>(
    'settings:getBasename',
    filePath,
  );
  return data;
};

export const getDirname = async (filePath: string): Promise<string> => {
  const { data } = await client.post<string, string>(
    'settings:getDirname',
    filePath,
  );
  return data;
};

export const setOpenAIKey = async (apiKey: string): Promise<void> => {
  await client.post<{ account: SecureStorageAccount; password: string }, void>(
    'secure-storage:set',
    { account: 'openai-api-key', password: apiKey },
  );
};

export const getOpenAIKey = async (): Promise<string | null> => {
  const { data } = await client.post<
    { account: SecureStorageAccount },
    string | null
  >('secure-storage:get', { account: 'openai-api-key' });
  return data;
};

export const deleteOpenAIKey = async (): Promise<void> => {
  await client.post<{ account: SecureStorageAccount }, void>(
    'secure-storage:delete',
    { account: 'openai-api-key' },
  );
};

export const resetFactorySettings = async (): Promise<void> => {
  await client.post<void, void>('settings:reset-factory', undefined);
};

// KiSQL (Kinetica CLI) services
export const checkKisqlVersion = async (): Promise<{
  installed: boolean;
  version?: string;
  path?: string;
  latestSha?: string;
  updateAvailable?: boolean;
}> => {
  const { data } = await client.get<{
    installed: boolean;
    version?: string;
    path?: string;
    latestSha?: string;
    updateAvailable?: boolean;
  }>('kisql:check');
  return data;
};

export const installKisql = async (): Promise<{
  success: boolean;
  version: string;
  path: string;
  error?: string;
}> => {
  const { data } = await client.post<
    undefined,
    { success: boolean; version: string; path: string; error?: string }
  >('kisql:install', undefined);
  return data;
};

export const uninstallKisql = async (): Promise<void> => {
  await client.get('kisql:uninstall');
};

export const restartApp = async (): Promise<void> => {
  await client.post<void, void>('settings:restart', undefined);
};

// Rosetta version management services
export const checkRosettaVersions = async (): Promise<RosettaVersionInfo> => {
  const { data } = await client.get<RosettaVersionInfo>(
    'version:rosetta:check',
  );
  return data;
};

export const installRosettaVersion = async (
  version: string,
): Promise<InstallResult> => {
  const { data } = await client.post<string, InstallResult>(
    'version:rosetta:install',
    version,
  );
  return data;
};

export const uninstallRosetta = async (): Promise<void> => {
  await client.get<void>('version:rosetta:uninstall');
};

// Managed Python version management services
export const checkPythonInstall = async (): Promise<PythonInstallInfo> => {
  const { data } = await client.get<PythonInstallInfo>('version:python:check');
  return data;
};

export const installPython = async (): Promise<InstallResult> => {
  const { data } = await client.post<void, InstallResult>(
    'version:python:install',
    undefined,
  );
  return data;
};

export const uninstallPython = async (): Promise<void> => {
  await client.get<void>('version:python:uninstall');
};

export const checkPythonVersions = async (): Promise<PythonVersionInfo> => {
  const { data } = await client.get<PythonVersionInfo>(
    'version:python:versions:check',
  );
  return data;
};

export const installPythonVersion = async (
  version: string,
): Promise<InstallResult> => {
  const { data } = await client.post<string, InstallResult>(
    'version:python:versions:install',
    version,
  );
  return data;
};

export const checkRunnerVersions = async (): Promise<RunnerVersionInfo> => {
  const { data } = await client.get<RunnerVersionInfo>('version:runner:check');
  return data;
};

export const installRunnerVersion = async (
  version: string,
): Promise<InstallResult> => {
  const { data } = await client.post<string, InstallResult>(
    'version:runner:install',
    version,
  );
  return data;
};

export const uninstallRunnerVersion = async (): Promise<void> => {
  await client.get<void>('version:runner:uninstall');
};

export const checkRunnerPluginDependencies = async (): Promise<
  RunnerPluginStatus[]
> => {
  const { data } = await client.get<RunnerPluginStatus[]>(
    'runner:plugins:check',
  );
  return data;
};

// DuckDB management services
export const getDuckDbMetadata = async (): Promise<any> => {
  const { data } = await client.get<any>('settings:duckdb:metadata');
  return data;
};

export const refreshDuckDbMetadata = async (): Promise<any> => {
  const { data } = await client.get<any>('settings:duckdb:refresh');
  return data;
};

export const reinitializeDuckDb = async (options?: {
  dropExisting?: boolean;
}): Promise<any> => {
  const { data } = await client.post<any, any>(
    'settings:duckdb:reinitialize',
    options,
  );
  return data;
};

export const diagnoseDuckDb = async (): Promise<any> => {
  const { data } = await client.get<any>('settings:duckdb:diagnose');
  return data;
};

export const installSqlGlot = async (): Promise<void> => {
  await client.get<void>('settings:installSqlGlot');
};
