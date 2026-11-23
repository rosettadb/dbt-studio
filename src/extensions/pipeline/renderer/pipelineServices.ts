import { client } from '../../../extensionApi/studio/ipcClient';
import type {
  PluginDefinition,
  RunnerRequirementStatus,
} from '../../../extensionApi/studio/pipelineShared';

// Calls to the pipeline tool's main-process handlers.

export const listPipelines = async (
  projectId: string,
): Promise<{ name: string; path: string }[]> => {
  const { data } = await client.post<
    { projectId: string },
    { name: string; path: string }[]
  >('project:listPipelines', { projectId });
  return data;
};

export const extractRequiredEnvVars = async (
  projectId: string,
  pipelineRelativePath?: string,
): Promise<{ name: string; value?: string; sources: string[] }[]> => {
  const { data } = await client.post<
    { projectId: string; pipelineRelativePath?: string },
    { name: string; value?: string; sources: string[] }[]
  >('project:extractRequiredEnvVars', { projectId, pipelineRelativePath });
  return data;
};

export const checkRunnerRequirements = async (): Promise<
  RunnerRequirementStatus[]
> => {
  const { data } = await client.get<RunnerRequirementStatus[]>(
    'runner:requirements:check',
  );
  return data;
};

export const getRunnerPlugins = async (): Promise<PluginDefinition[]> => {
  const { data } = await client.get<PluginDefinition[]>(
    'runner:plugins:manifest',
  );
  return data;
};

export const getPluginMacroDirs = async (
  projectPath: string,
): Promise<{ dbtDir: string; rosettaDir: string }> => {
  const { data } = await client.post<
    string,
    { dbtDir: string; rosettaDir: string }
  >('runner:plugins:macros', projectPath);
  return data;
};

export const installPySpark = async (): Promise<void> => {
  await client.get<void>('runner:pyspark:install');
};

export const uninstallPySpark = async (): Promise<void> => {
  await client.get<void>('runner:pyspark:uninstall');
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
