import { ipcMain } from 'electron';
import { GitService } from '../services';
import { AuthError } from '../errors';
import { FileStatus, GitCredentials } from '../../types/backend';

const gitService = new GitService();

const handlerChannels = [
  'git:init',
  'git:clone',
  'git:listBranches',
  'git:checkout',
  'git:addRemote',
  'git:isInitialized',
  'git:getRemotes',
  'git:add',
  'git:commit',
  'git:pull',
  'git:push',
  'git:fileDiff',
  'git:fileStatusList',
];

const removeGitIpcHandlers = () => {
  handlerChannels.forEach((channel) => {
    ipcMain.removeHandler(channel);
  });
};

const registerGitHandlers = () => {
  removeGitIpcHandlers();
  ipcMain.handle('git:init', async (_event, repoPath: string) => {
    return gitService.initRepo(repoPath);
  });

  ipcMain.handle(
    'git:clone',
    async (
      _event,
      { url, credentials }: { url: string; credentials?: GitCredentials },
    ) => {
      try {
        return await gitService.cloneRepo(url, credentials);
      } catch (err: any) {
        if (err instanceof AuthError) return { authRequired: true };
        return { error: err?.message };
      }
    },
  );

  ipcMain.handle('git:listBranches', async (_event, repoPath: string) => {
    return gitService.listBranches(repoPath);
  });

  ipcMain.handle(
    'git:checkout',
    async (
      _event,
      { repoPath, branchName }: { repoPath: string; branchName: string },
    ) => {
      return gitService.checkoutBranch(repoPath, branchName);
    },
  );

  ipcMain.handle(
    'git:addRemote',
    async (
      _event,
      { repoPath, remoteUrl }: { repoPath: string; remoteUrl: string },
    ) => {
      return gitService.addRemote(repoPath, remoteUrl);
    },
  );

  ipcMain.handle('git:isInitialized', async (_event, repoPath: string) => {
    return gitService.isRepoInitialized(repoPath);
  });

  ipcMain.handle('git:getRemotes', async (_event, repoPath: string) => {
    return gitService.getRemotes(repoPath);
  });

  ipcMain.handle(
    'git:add',
    async (_e, { repoPath, files }: { repoPath: string; files: string[] }) => {
      return gitService.add(repoPath, files);
    },
  );

  ipcMain.handle(
    'git:commit',
    async (
      _e,
      {
        repoPath,
        message,
        files,
      }: { repoPath: string; message: string; files: string[] },
    ) => {
      return gitService.commit(repoPath, message, files);
    },
  );

  ipcMain.handle(
    'git:pull',
    async (
      _e,
      {
        repoPath,
        credentials,
      }: {
        repoPath: string;
        credentials?: GitCredentials;
      },
    ) => {
      try {
        return await gitService.pull(repoPath, credentials);
      } catch (err: any) {
        if (err instanceof AuthError) return { authRequired: true };
        return { error: err?.message };
      }
    },
  );

  ipcMain.handle(
    'git:push',
    async (
      _e,
      {
        repoPath,
        credentials,
      }: {
        repoPath: string;
        credentials?: GitCredentials;
      },
    ) => {
      try {
        return await gitService.push(repoPath, credentials);
      } catch (err: any) {
        if (err instanceof AuthError) return { authRequired: true };
        return { error: err?.message };
      }
    },
  );

  ipcMain.handle(
    'git:fileDiff',
    async (
      _e,
      {
        repoPath,
        filePath,
      }: {
        repoPath: string;
        filePath: string;
      },
    ): Promise<{ filePath?: string; repoPath?: string; error?: string }> => {
      try {
        return await gitService.getDiffForFile(repoPath, filePath);
      } catch (err: any) {
        return { error: err?.message };
      }
    },
  );

  ipcMain.handle(
    'git:fileStatusList',
    async (
      _event,
      { repoPath }: { repoPath: string },
    ): Promise<FileStatus[]> => {
      return gitService.getFileStatusList(repoPath);
    },
  );
};

export default registerGitHandlers;
