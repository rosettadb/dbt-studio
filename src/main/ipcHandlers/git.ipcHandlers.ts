import { ipcMain } from 'electron';
import { GitService } from '../services';
import { AuthError } from '../errors';
import {
  FileStatus,
  GitChangesRes,
  GitCredentials,
  RepoInfoRes,
} from '../../types/backend';

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
  'git:unstage',
  'git:stageAll',
  'git:unstageAll',
  'git:discardChanges',
  'git:commit',
  'git:pull',
  'git:push',
  'git:fileDiff',
  'git:fileHeadContent',
  'git:fileStatusList',
  'git:isFileUnpushed',
  'git:aheadBehind',
  'git:createBranch',
  'git:deleteBranch',
  'git:renameBranch',
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
      {
        url,
        credentials,
        removeGit,
      }: { url: string; credentials?: GitCredentials; removeGit?: boolean },
    ) => {
      try {
        const result = await gitService.cloneRepo(
          url,
          credentials,
          removeGit ?? false,
        );
        return {
          name: result.name,
          path: result.path,
          dbtConnection: result.dbtConnection,
          rosettaConnection: result.rosettaConnection,
          connectionId: result.connectionId,
        };
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
      { repoPath, message }: { repoPath: string; message: string },
    ) => {
      return gitService.commit(repoPath, message);
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
    'git:fileHeadContent',
    async (
      _e,
      { repoPath, filePath }: { repoPath: string; filePath: string },
    ): Promise<string | null> => {
      return gitService.getFileHeadContent(repoPath, filePath);
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

  ipcMain.handle(
    'git:fileStatus',
    async (
      _event,
      { repoPath, filePath }: { repoPath: string; filePath: string },
    ): Promise<FileStatus | null> => {
      return gitService.getFileStatus(repoPath, filePath);
    },
  );

  ipcMain.handle(
    'git:isFileUnpushed',
    async (
      _event,
      { repoPath, filePath }: { repoPath: string; filePath: string },
    ): Promise<boolean> => {
      return gitService.isFileUnpushed(repoPath, filePath);
    },
  );

  ipcMain.handle(
    'git:getLocalChanges',
    async (
      _event,
      { repoPath }: { repoPath: string },
    ): Promise<GitChangesRes | null> => {
      return gitService.getLocalChangesStatus(repoPath);
    },
  );

  ipcMain.handle(
    'git:repoInfo',
    async (
      _event,
      { repoPath }: { repoPath: string },
    ): Promise<RepoInfoRes | null> => {
      return gitService.getRepoInfo(repoPath);
    },
  );

  ipcMain.handle(
    'git:unstage',
    async (
      _event,
      { repoPath, files }: { repoPath: string; files: string[] },
    ) => {
      return gitService.unstage(repoPath, files);
    },
  );

  ipcMain.handle(
    'git:stageAll',
    async (_event, { repoPath }: { repoPath: string }) => {
      return gitService.stageAll(repoPath);
    },
  );

  ipcMain.handle(
    'git:unstageAll',
    async (_event, { repoPath }: { repoPath: string }) => {
      return gitService.unstageAll(repoPath);
    },
  );

  ipcMain.handle(
    'git:discardChanges',
    async (
      _event,
      { repoPath, files }: { repoPath: string; files: string[] },
    ) => {
      return gitService.discardChanges(repoPath, files);
    },
  );

  ipcMain.handle(
    'git:aheadBehind',
    async (_event, { repoPath }: { repoPath: string }) => {
      return gitService.getAheadBehindCount(repoPath);
    },
  );

  ipcMain.handle(
    'git:createBranch',
    async (
      _event,
      { repoPath, branchName }: { repoPath: string; branchName: string },
    ) => {
      return gitService.createBranch(repoPath, branchName);
    },
  );

  ipcMain.handle(
    'git:deleteBranch',
    async (
      _event,
      {
        repoPath,
        branchName,
        force,
      }: { repoPath: string; branchName: string; force?: boolean },
    ) => {
      return gitService.deleteBranch(repoPath, branchName, force);
    },
  );

  ipcMain.handle(
    'git:renameBranch',
    async (
      _event,
      {
        repoPath,
        oldName,
        newName,
      }: { repoPath: string; oldName: string; newName: string },
    ) => {
      return gitService.renameBranch(repoPath, oldName, newName);
    },
  );
};

export default registerGitHandlers;
