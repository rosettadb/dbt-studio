import { RemoteWithRefs } from 'simple-git';
import { client } from '../config/client';
import {
  DiffResponse,
  FileStatus,
  GitBranch,
  GitCredentials,
} from '../../types/backend';

export const gitInit = async (path: string) => {
  await client.post<string>('git:init', path);
};

export const gitClone = async (url: string, credentials?: GitCredentials) => {
  const { data } = await client.post<
    { url: string; credentials?: GitCredentials },
    { error?: string; authRequired?: boolean; name?: string; path?: string }
  >('git:clone', {
    url,
    credentials,
  });
  return data;
};

export const isInitialized = async (path: string) => {
  const { data } = await client.post<string, boolean>(
    'git:isInitialized',
    path,
  );
  return data;
};

export const getRemotes = async (path: string) => {
  const { data } = await client.post<string, RemoteWithRefs[]>(
    'git:getRemotes',
    path,
  );
  return data;
};

export const addRemote = async (path: string, url: string) => {
  await client.post<{ repoPath: string; remoteUrl: string }>('git:addRemote', {
    repoPath: path,
    remoteUrl: url,
  });
};

export const add = async (path: string, files: string[]) => {
  await client.post<{ repoPath: string; files: string[] }>('git:add', {
    repoPath: path,
    files,
  });
};

export const commit = async (
  path: string,
  message: string,
  files: string[],
) => {
  await client.post<{ repoPath: string; message: string; files: string[] }>(
    'git:commit',
    { repoPath: path, message, files },
  );
};

export const push = async (repoPath: string, credentials?: GitCredentials) => {
  const { data } = await client.post<
    { repoPath: string; credentials?: GitCredentials },
    { error?: string; authRequired?: boolean }
  >('git:push', { repoPath, credentials });
  return data;
};

export const pull = async (repoPath: string, credentials?: GitCredentials) => {
  const { data } = await client.post<
    { repoPath: string; credentials?: GitCredentials },
    { error?: string; authRequired?: boolean }
  >('git:pull', { repoPath, credentials });
  return data;
};

export const checkout = async (path: string, branch: string): Promise<void> => {
  await client.post<{ repoPath: string; branchName: string }, void>(
    'git:checkout',
    { repoPath: path, branchName: branch },
  );
};

export const listBranches = async (path: string): Promise<GitBranch[]> => {
  const { data } = await client.post<string, GitBranch[]>(
    'git:listBranches',
    path,
  );
  return data;
};

export const getFileDiff = async (repoPath: string, filePath: string) => {
  const { data } = await client.post<
    { filePath: string; repoPath: string },
    DiffResponse
  >('git:fileDiff', { filePath, repoPath });
  return data;
};

export const getFileStatus = async (repoPath: string) => {
  const { data } = await client.post<{ repoPath: string }, FileStatus[]>(
    'git:fileStatusList',
    { repoPath },
  );
  return data;
};
