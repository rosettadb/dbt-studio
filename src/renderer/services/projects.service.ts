import { client } from '../config/client';
import {
  GenerateDashboardResponseType,
  ConnectionInput,
  FileNode,
  Project,
  Table,
  EnhanceModelResponseType,
} from '../../types/backend';

export const getProjects = async (): Promise<Project[]> => {
  const { data } = await client.get<Project[]>('project:list');
  return data;
};

export const getProjectById = async (body: {
  id: string;
}): Promise<Project | undefined> => {
  const { data } = await client.post<{ id: string }, Project | undefined>(
    'project:get',
    body,
  );
  return data;
};

export const addProject = async (body: { name: string }): Promise<Project> => {
  const { data } = await client.post<{ name: string }, Project>(
    'project:add',
    body,
  );
  return data;
};

export const addProjectFromVCS = async (body: {
  name: string;
  path: string;
}): Promise<Project> => {
  const { data } = await client.post<{ name: string; path: string }, Project>(
    'project:addFromVCS',
    body,
  );
  return data;
};

export const addProjectFromFolder = async (): Promise<Project> => {
  const { data } = await client.get<Project>('project:addFromFolder');
  return data;
};

export const updateProject = async (body: Project): Promise<Project> => {
  const { data } = await client.post<Project, Project>('project:update', body);
  return data;
};

export const deleteProject = async (body: { id: string }): Promise<boolean> => {
  const { data } = await client.post<{ id: string }, boolean>(
    'project:delete',
    body,
  );
  return data;
};

export const loadProjectDirectory = async (body: {
  path: string;
}): Promise<FileNode> => {
  const { data } = await client.post<{ path: string }, FileNode>(
    'project:getDirectory',
    body,
  );
  return data;
};

export const getFileContent = async (body: {
  path: string;
}): Promise<string> => {
  const { data } = await client.post<{ path: string }, string>(
    'project:readFile',
    body,
  );
  return data;
};

export const saveFileContent = async (body: {
  path: string;
  content: string;
}): Promise<boolean> => {
  const { data } = await client.post<
    { path: string; content: string },
    boolean
  >('project:updateFile', body);
  return data;
};

export const getProjectPath = async (body: {
  name: string;
}): Promise<string> => {
  const { data } = await client.post<{ name: string }, string>(
    'project:getPath',
    body,
  );
  return data;
};

export const configureConnection = async (body: {
  id: string;
  connection: ConnectionInput;
}): Promise<void> => {
  await client.post<{ id: string; connection: ConnectionInput }, Project>(
    'project:configureConnection',
    body,
  );
};

export const postRosettaDBTCopy = async (body: Project): Promise<void> => {
  const { data } = await client.post<Project>(
    'project:postRosettaDBTCopy',
    body,
  );
  return data;
};

export const extractSchema = async (body: Project): Promise<Table[]> => {
  const { data } = await client.post<Project, Table[]>(
    'project:extractSchema',
    body,
  );
  return data;
};

export const extractSchemaFromModelYaml = async (
  body: Project,
): Promise<Table[]> => {
  const { data } = await client.post<Project, Table[]>(
    'project:extractSchemaFromModelYaml',
    body,
  );
  return data;
};

export const createFile = async (body: {
  filePath: string;
  name: string;
  content?: string;
}): Promise<void> => {
  const { data } = await client.post<{
    filePath: string;
    name: string;
    content?: string;
  }>('project:createFile', body);
  return data;
};

export const createFolder = async (body: {
  filePath: string;
  name: string;
}): Promise<void> => {
  const { data } = await client.post<{
    filePath: string;
    name: string;
  }>('project:createFolder', body);
  return data;
};

export const deleteItem = async (body: { filePath: string }): Promise<void> => {
  const { data } = await client.post<{
    filePath: string;
  }>('project:deleteItem', body);
  return data;
};

export const selectProject = async (body: {
  projectId: string;
}): Promise<void> => {
  await client.post<{ projectId: string }>('project:select', body);
};

export const getSelectedProject = async (): Promise<Project | undefined> => {
  const { data } = await client.get<Project | undefined>('project:selected');
  return data;
};

export const runCliCommand = async (command: string): Promise<void> => {
  await client.post<{ command: string }>('cli:run', { command });
};

export const startProcess = async (command: string): Promise<void> => {
  await client.post<{ command: string }>('process:start', { command });
};

export const getProcessStatus = async (): Promise<{
  running: boolean;
  pid: number | null;
}> => {
  const { data } = await client.get<{ running: boolean; pid: number | null }>(
    'process:status',
  );
  return data;
};

export const stopProcess = async (): Promise<void> => {
  await client.get('process:stop');
};

export const fileSync = async (project: Project): Promise<void> => {
  await client.post<Project, void>('cli:run', project);
};

export const generateDashboardQuery = async (
  prompt: string,
): Promise<GenerateDashboardResponseType[]> => {
  const { data } = await client.post<string, GenerateDashboardResponseType[]>(
    'project:generateDashboardsQuery',
    prompt,
  );
  return data;
};

export const enhanceModelQuery = async (
  prompt: string,
): Promise<EnhanceModelResponseType> => {
  const { data } = await client.post<string, EnhanceModelResponseType>(
    'project:enhanceModelQuery',
    prompt,
  );
  return data;
};

export const zipDir = async (path: string): Promise<void> => {
  await client.post<string>('project:zipDir', path);
};
