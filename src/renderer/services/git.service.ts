import { RemoteWithRefs } from 'simple-git';
import { client } from '../config/client';
import {
  DBTConnection,
  DiffResponse,
  FileStatus,
  GitBranch,
  GitChangesRes,
  GitCredentials,
  RepoInfoRes,
  RosettaConnection,
} from '../../types/backend';

export const gitInit = async (path: string) => {
  await client.post<string>('git:init', path);
};

export const gitClone = async (
  url: string,
  credentials?: GitCredentials,
  removeGit?: boolean,
) => {
  const { data } = await client.post<
    { url: string; credentials?: GitCredentials; removeGit?: boolean },
    {
      error?: string;
      authRequired?: boolean;
      name?: string;
      path?: string;
      dbtConnection?: DBTConnection;
      rosettaConnection?: RosettaConnection;
      connectionId?: string;
    }
  >('git:clone', {
    url,
    credentials,
    removeGit,
  });
  return data;
};

export const isInitialized = async (path?: string) => {
  const { data } = await client.post<string | undefined, boolean>(
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
  const { data } = await client.post<
    { repoPath: string; files: string[] },
    { success: boolean }
  >('git:add', {
    repoPath: path,
    files,
  });
  return data;
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

export const getFileStatusList = async (repoPath?: string) => {
  const { data } = await client.post<{ repoPath?: string }, FileStatus[]>(
    'git:fileStatusList',
    { repoPath },
  );
  return data;
};

export const getFileStatus = async (repoPath: string, filePath: string) => {
  const { data } = await client.post<
    { repoPath: string; filePath: string },
    FileStatus | null
  >('git:fileStatus', { repoPath, filePath });
  return data;
};

export const getLocalChanges = async (repoPath: string) => {
  const { data } = await client.post<
    { repoPath: string },
    GitChangesRes | null
  >('git:getLocalChanges', { repoPath });
  return data;
};

export const getRepoInfo = async (repoPath: string) => {
  const { data } = await client.post<{ repoPath: string }, RepoInfoRes | null>(
    'git:repoInfo',
    { repoPath },
  );
  return data;
};

export const unstage = async (repoPath: string, files: string[]) => {
  const { data } = await client.post<
    { repoPath: string; files: string[] },
    { success: boolean }
  >('git:unstage', { repoPath, files });
  return data;
};

export const stageAll = async (repoPath: string) => {
  const { data } = await client.post<
    { repoPath: string },
    { success: boolean }
  >('git:stageAll', { repoPath });
  return data;
};

export const unstageAll = async (repoPath: string) => {
  const { data } = await client.post<
    { repoPath: string },
    { success: boolean }
  >('git:unstageAll', { repoPath });
  return data;
};

export const discardChanges = async (repoPath: string, files: string[]) => {
  const { data } = await client.post<
    { repoPath: string; files: string[] },
    { success: boolean }
  >('git:discardChanges', { repoPath, files });
  return data;
};

export const getAheadBehindCount = async (repoPath: string) => {
  const { data } = await client.post<
    { repoPath: string },
    { ahead: number; behind: number } | null
  >('git:aheadBehind', { repoPath });
  return data;
};

export const createBranch = async (
  repoPath: string,
  branchName: string,
): Promise<void> => {
  await client.post<{ repoPath: string; branchName: string }, void>(
    'git:createBranch',
    { repoPath, branchName },
  );
};

export const deleteBranch = async (
  repoPath: string,
  branchName: string,
  force: boolean = false,
): Promise<void> => {
  await client.post<
    { repoPath: string; branchName: string; force?: boolean },
    void
  >('git:deleteBranch', { repoPath, branchName, force });
};

export const renameBranch = async (
  repoPath: string,
  oldName: string,
  newName: string,
): Promise<void> => {
  await client.post<
    { repoPath: string; oldName: string; newName: string },
    void
  >('git:renameBranch', { repoPath, oldName, newName });
};
