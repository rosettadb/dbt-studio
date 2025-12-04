/* eslint class-methods-use-this: off */
import simpleGit, { SimpleGit } from 'simple-git';
import path from 'path';
import fs from 'fs';
import { AuthError } from '../errors';
import { FileStatus, GitCredentials } from '../../types/backend';
import SettingsService from './settings.service';
import ConnectorsService from './connectors.service';

function getRepoNameFromUrl(url: string): string {
  const parts = url.split('/');
  let repoNameWithGit = parts[parts.length - 1];
  repoNameWithGit = repoNameWithGit.replace(/\.git$/, '');

  // Keep the original repository name, only replace invalid characters
  // Allow hyphens and underscores which are common in repo names
  let clean = repoNameWithGit.replace(/[^\w-]/g, '_');

  // Convert hyphens to underscores for dbt convention
  clean = clean.replace(/-/g, '_');

  // Only add underscore prefix if it starts with a number or special character
  if (/^[\d\W]/.test(clean)) {
    clean = `_${clean}`;
  }

  return clean;
}

function injectCredentialsIntoRemoteUrl(
  remoteUrl: string,
  credentials: GitCredentials,
) {
  const url = new URL(remoteUrl);
  url.username = credentials.username;
  url.password = credentials.password;
  return url.toString();
}

export function isAuthError(error: any): boolean {
  if (!error?.message && !error?.stderr) return false;

  const combinedMsg =
    `${error.message ?? ''}\n${error.stderr ?? ''}`.toLowerCase();

  return (
    combinedMsg.includes('authentication failed') ||
    combinedMsg.includes('fatal: authentication') ||
    combinedMsg.includes('fatal: could not read from remote repository') ||
    combinedMsg.includes('fatal: unable to access') ||
    combinedMsg.includes('fatal: unable to look up') ||
    combinedMsg.includes('403 forbidden') ||
    combinedMsg.includes('403') ||
    combinedMsg.includes('401 unauthorized') ||
    combinedMsg.includes('401') ||
    combinedMsg.includes('permission denied (publickey)') ||
    combinedMsg.includes('permission denied') ||
    combinedMsg.includes('remote: http basic: access denied') ||
    combinedMsg.includes('remote: invalid username or password') ||
    combinedMsg.includes('fatal: could not resolve hostname') ||
    combinedMsg.includes('could not resolve host') ||
    combinedMsg.includes('support for password authentication was removed')
  );
}

export default class GitService {
  getGitInstance(repoPath: string): SimpleGit {
    return simpleGit(repoPath);
  }

  async isTrackingSet(repoPath: string): Promise<boolean> {
    const git = this.getGitInstance(repoPath);
    const result = await git.raw(['status', '-sb']);
    const firstLine = result.trim().split('\n')[0];
    return firstLine.includes('...');
  }

  async ensureTrackingUpstream(repoPath: string, branch: string) {
    const git = this.getGitInstance(repoPath);

    const isTracking = await this.isTrackingSet(repoPath);
    if (isTracking) return;

    await git.branch(['--set-upstream-to', `origin/${branch}`, branch]);
  }

  async initRepo(repoPath: string) {
    const git = simpleGit(repoPath);
    await git.init(['--initial-branch=main']);

    // Only initialize git repository, don't automatically commit files
    // Let the user decide what to stage and commit
  }

  async listBranches(repoPath: string) {
    const git = this.getGitInstance(repoPath);

    const local = await git.branchLocal();
    const remote = await git.branch(['-r']);
    const { current } = await git.branch();

    const branchMap = new Map<
      string,
      {
        name: string;
        checkedOut: boolean;
        isLocal: boolean;
        isRemote: boolean;
        remoteName?: string;
      }
    >();

    local.all.forEach((localName) => {
      branchMap.set(localName, {
        name: localName,
        checkedOut: localName === current,
        isLocal: true,
        isRemote: false,
      });
    });

    remote.all.forEach((remoteName) => {
      if (remoteName.includes('->')) return;

      const cleanName = remoteName.replace(/^origin\//, '');

      if (branchMap.has(cleanName)) {
        const existing = branchMap.get(cleanName)!;
        existing.isRemote = true;
        existing.remoteName = remoteName;
      } else {
        branchMap.set(cleanName, {
          name: cleanName,
          checkedOut: false,
          isLocal: false,
          isRemote: true,
          remoteName,
        });
      }
    });

    return Array.from(branchMap.values());
  }

  async checkoutBranch(repoPath: string, branchName: string) {
    const git = this.getGitInstance(repoPath);
    await git.fetch();

    const localBranches = await git.branchLocal();
    const remoteBranches = await git.branch(['-r']);
    const hasLocal = localBranches.all.includes(branchName);
    const hasRemote = remoteBranches.all.includes(`origin/${branchName}`);

    try {
      if (hasLocal) {
        await git.checkout(branchName);
        await this.ensureTrackingUpstream(repoPath, branchName);
      } else if (hasRemote) {
        await git.checkout([
          '-b',
          branchName,
          '--track',
          `origin/${branchName}`,
        ]);
      } else {
        await git.checkoutLocalBranch(branchName);
      }

      return { success: true, checkedOut: branchName };
    } catch (err: any) {
      throw new Error(`Checkout failed: ${err.message}`);
    }
  }

  async addRemote(repoPath: string, remoteUrl: string) {
    const git = this.getGitInstance(repoPath);
    const remotes = await git.getRemotes(true);

    const hasOrigin = remotes.some((r) => r.name === 'origin');

    if (hasOrigin) {
      await git.remote(['set-url', 'origin', remoteUrl]);
    } else {
      await git.addRemote('origin', remoteUrl);
    }

    return { success: true };
  }

  async isRepoInitialized(repoPath: string) {
    try {
      const git = this.getGitInstance(repoPath);
      await git.status();
      return true;
    } catch (err) {
      return false;
    }
  }

  async getRemotes(repoPath: string) {
    const git = this.getGitInstance(repoPath);
    return git.getRemotes(true);
  }

  async pull(repoPath: string, credentials?: GitCredentials) {
    const git = this.getGitInstance(repoPath);
    const branchSummary = await git.branch();
    const currentBranch = branchSummary.current;
    await this.ensureTrackingUpstream(repoPath, currentBranch);
    try {
      if (credentials) {
        const remotes = await git.getRemotes(true);
        const origin = remotes.find((r) => r.name === 'origin');
        if (!origin || !origin.refs.fetch) {
          throw new Error('Origin remote not found');
        }

        const remoteWithAuth = injectCredentialsIntoRemoteUrl(
          origin.refs.fetch,
          credentials,
        );

        await git.remote(['set-url', 'origin', remoteWithAuth]);
        await git.pull('origin');
        await git.remote(['set-url', 'origin', origin.refs.fetch]);
      } else {
        await git.pull('origin');
      }

      return { success: true };
    } catch (err) {
      if (isAuthError(err)) {
        throw new AuthError();
      }
      throw err;
    }
  }

  async add(repoPath: string, files: string[] = ['.']) {
    const git = this.getGitInstance(repoPath);

    try {
      // Convert absolute paths to relative paths for git
      const relativePaths = files.map((file) => {
        // If it's already a relative path or '.', use it as is
        if (file === '.' || !path.isAbsolute(file)) {
          return file;
        }
        // Convert absolute path to relative path
        return path.relative(repoPath, file);
      });

      await git.add(relativePaths);

      return { success: true };
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('Git add failed:', err);
      throw new Error(`Add failed: ${err.message}`);
    }
  }

  async unstage(repoPath: string, files: string[]) {
    const git = this.getGitInstance(repoPath);

    try {
      // Convert absolute paths to relative paths for git
      const relativePaths = files.map((file) => {
        if (!path.isAbsolute(file)) {
          return file;
        }
        return path.relative(repoPath, file);
      });

      await git.reset(['HEAD', ...relativePaths]);
      return { success: true };
    } catch (err: any) {
      throw new Error(`Unstage failed: ${err.message}`);
    }
  }

  async stageAll(repoPath: string) {
    const git = this.getGitInstance(repoPath);

    try {
      await git.add('.');
      return { success: true };
    } catch (err: any) {
      throw new Error(`Stage all failed: ${err.message}`);
    }
  }

  async unstageAll(repoPath: string) {
    const git = this.getGitInstance(repoPath);

    try {
      await git.reset(['HEAD']);
      return { success: true };
    } catch (err: any) {
      throw new Error(`Unstage all failed: ${err.message}`);
    }
  }

  async discardChanges(repoPath: string, files: string[]) {
    const git = this.getGitInstance(repoPath);

    try {
      // Convert absolute paths to relative paths for git
      const relativePaths = files.map((file) => {
        if (!path.isAbsolute(file)) {
          return file;
        }
        return path.relative(repoPath, file);
      });

      await git.checkout(['--', ...relativePaths]);
      return { success: true };
    } catch (err: any) {
      throw new Error(`Discard changes failed: ${err.message}`);
    }
  }

  async commit(repoPath: string, message: string, files: string[] = ['.']) {
    const git = this.getGitInstance(repoPath);

    try {
      await git.add(files);
      await git.commit(message);
      return { success: true };
    } catch (err: any) {
      throw new Error(`Commit failed: ${err.message}`);
    }
  }

  async push(
    repoPath: string,
    credentials?: { username: string; password: string },
  ) {
    const git = this.getGitInstance(repoPath);

    try {
      const remotes = await git.getRemotes(true);
      const origin = remotes.find((r) => r.name === 'origin');
      if (!origin || !origin.refs.push) {
        throw new Error('Origin remote not found');
      }

      const branchSummary = await git.branch();
      const currentBranch = branchSummary.current;
      const remoteWithAuth = credentials
        ? injectCredentialsIntoRemoteUrl(origin.refs.push, credentials)
        : origin.refs.push;

      await git.remote(['set-url', 'origin', remoteWithAuth]);

      try {
        await git.push('origin', currentBranch);
      } catch (err: any) {
        const msg = err.message?.toLowerCase() ?? '';

        const shouldTryUpstreamPush =
          msg.includes('no upstream') ||
          msg.includes('requested upstream branch') ||
          msg.includes('set the upstream config') ||
          msg.includes('has no upstream');

        if (shouldTryUpstreamPush) {
          await git.push(['-u', 'origin', currentBranch]);
        } else {
          throw err;
        }
      }

      await git.remote(['set-url', 'origin', origin.refs.push]);

      return { success: true };
    } catch (err) {
      if (isAuthError(err)) throw new AuthError();
      throw err;
    }
  }

  async cloneRepo(remoteUrl: string, credentials?: GitCredentials) {
    const basePath = (await SettingsService.loadSettings()).projectsDirectory;

    if (!basePath) {
      throw new Error('Destination path not found');
    }

    const git = simpleGit();
    const repoName = getRepoNameFromUrl(remoteUrl);
    const destinationPath = path.join(basePath, repoName);

    try {
      let urlToUse = remoteUrl;

      if (credentials) {
        urlToUse = injectCredentialsIntoRemoteUrl(remoteUrl, credentials);
      }

      await git.clone(urlToUse, destinationPath);

      const dbtProjectPath = await this.findDbtProjectPath(destinationPath);
      const projectPath = dbtProjectPath || destinationPath;

      const connections =
        await ConnectorsService.parseProjectConnectionFiles(projectPath);

      let connectionId: string | undefined;

      // Only configure connection if connection files were found
      if (connections.connectionInput) {
        connectionId = await ConnectorsService.configureConnection({
          connection: connections.connectionInput,
        });
      }

      return {
        path: projectPath, // Use the dbt project path instead of destination path
        name: repoName,
        dbtConnection: connections.dbtConnection,
        rosettaConnection: connections.rosettaConnection,
        connectionId,
      };
    } catch (err: any) {
      if (isAuthError(err)) throw new AuthError();
      throw new Error(`Clone failed: ${err.message}`);
    }
  }

  // Helper function to recursively find dbt_project.yml
  async findDbtProjectPath(rootPath: string): Promise<string | null> {
    async function searchRecursively(
      currentPath: string,
    ): Promise<string | null> {
      try {
        const entries = fs.readdirSync(currentPath, { withFileTypes: true });

        // Check if dbt_project.yml exists in current directory
        const hasDbtProject = entries.some(
          (entry) => entry.isFile() && entry.name === 'dbt_project.yml',
        );

        if (hasDbtProject) {
          return currentPath;
        }

        // Search in subdirectories
        // eslint-disable-next-line no-restricted-syntax
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            const subdirPath = path.join(currentPath, entry.name);
            // eslint-disable-next-line no-await-in-loop
            const result = await searchRecursively(subdirPath);
            if (result) {
              return result;
            }
          }
        }

        return null;
      } catch (error) {
        // Handle permission errors or other issues
        return null;
      }
    }

    return searchRecursively(rootPath);
  }

  async getDiffForFile(repoPath: string, filePath: string) {
    const git = this.getGitInstance(repoPath);

    try {
      // Convert absolute path to relative path for git
      const relativePath = path.relative(repoPath, filePath);

      // Get diff for the file (working directory vs HEAD)
      const diff = await git.diff(['HEAD', '--', relativePath]);

      return { filePath, diff };
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('Git diff error:', err);
      throw new Error(`Failed to get diff: ${err.message}`);
    }
  }

  async getFileStatusList(repoPath: string): Promise<FileStatus[]> {
    const git = this.getGitInstance(repoPath);
    const results: FileStatus[] = [];
    const processedFiles = new Set<string>();

    try {
      // Force refresh git index to detect file changes
      try {
        await git.raw(['update-index', '--refresh']);
      } catch (refreshError) {
        // Git index refresh can fail normally, ignore errors
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Git status check failed:', error);
    }

    // Step 1: Get git status for tracked/modified files
    const rawStatus = await git.raw(['status', '--porcelain']);

    // Don't trim the whole string - preserve leading spaces on each line
    const lines = rawStatus.split('\n').filter((line) => line.length > 0);

    lines.forEach((line) => {
      if (line.length < 3) return;

      // Git porcelain format: XY filename
      // X = index status (position 0)
      // Y = work tree status (position 1)
      // Space at position 2
      // Filename starts at position 3
      const indexStatus = line[0]; // Staged status (position 0)
      const workTreeStatus = line[1]; // Working tree status (position 1)
      const filePath = line.substring(3); // File path (skip 'XY ' - 2 status chars + 1 space)
      const fullPath = path.join(repoPath, filePath);

      // Skip directories
      if (filePath.endsWith('/')) {
        return;
      }

      processedFiles.add(fullPath);

      // Handle staged changes (index status)
      if (indexStatus !== ' ' && indexStatus !== '?') {
        let status: 'staged' | 'deleted' | 'renamed';
        switch (indexStatus) {
          case 'A':
            status = 'staged';
            break;
          case 'M':
            status = 'staged';
            break;
          case 'D':
            status = 'deleted';
            break;
          case 'R':
            status = 'renamed';
            break;
          case 'C':
            status = 'staged';
            break;
          default:
            status = 'staged';
            break;
        }
        results.push({ path: fullPath, status });
      }

      // Handle working tree changes (work tree status)
      if (workTreeStatus !== ' ') {
        let status: 'modified' | 'deleted' | 'untracked';
        switch (workTreeStatus) {
          case 'M':
            status = 'modified';
            break;
          case 'D':
            status = 'deleted';
            break;
          case '?':
            status = 'untracked';
            break;
          default:
            status = 'modified';
            break;
        }
        results.push({ path: fullPath, status });
      }
    });

    // Step 2: Scan file tree for untracked files that git doesn't know about
    const untrackedFiles = await this.scanForUntrackedFiles(
      repoPath,
      processedFiles,
    );
    results.push(...untrackedFiles);

    return results;
  }

  private async scanForUntrackedFiles(
    repoPath: string,
    processedFiles: Set<string>,
  ): Promise<FileStatus[]> {
    const git = this.getGitInstance(repoPath);

    try {
      const lsOutput = await git.raw([
        'ls-files',
        '--others',
        '--exclude-standard',
      ]);

      return lsOutput
        .split('\n')
        .map((line) => line.trim())
        .filter((line): line is string => Boolean(line))
        .map((relativePath) => path.join(repoPath, relativePath))
        .filter((fullPath) => !processedFiles.has(fullPath))
        .map((fullPath) => ({ path: fullPath, status: 'untracked' as const }));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Could not list untracked files:', error);
      return [];
    }
  }

  async getFileStatus(
    repoPath: string,
    filePath: string,
  ): Promise<FileStatus | null> {
    const git = this.getGitInstance(repoPath);

    // Get relative path (how Git reports it)
    const relativePath = path.relative(repoPath, filePath);

    // Run status for this file
    const status = await git.status([relativePath]);

    const fullPath = path.join(repoPath, relativePath);

    if (status.not_added.includes(relativePath)) {
      return { path: fullPath, status: 'untracked' };
    }
    if (status.modified.includes(relativePath)) {
      return { path: fullPath, status: 'modified' };
    }
    if (status.staged.includes(relativePath)) {
      return { path: fullPath, status: 'staged' };
    }
    if (status.deleted.includes(relativePath)) {
      return { path: fullPath, status: 'deleted' };
    }
    if (status.renamed.some((entry) => entry.to === relativePath)) {
      return { path: fullPath, status: 'renamed' };
    }
    if (status.conflicted.includes(relativePath)) {
      return { path: fullPath, status: 'conflicted' };
    }

    return null;
  }

  async getAheadBehindCount(
    repoPath: string,
  ): Promise<{ ahead: number; behind: number } | null> {
    const git = this.getGitInstance(repoPath);

    try {
      // Check if there's a remote tracking branch
      const isTracking = await this.isTrackingSet(repoPath);
      if (!isTracking) {
        return null;
      }

      // Get ahead/behind count
      const result = await git.raw([
        'rev-list',
        '--left-right',
        '--count',
        'HEAD...@{upstream}',
      ]);
      const [ahead, behind] = result.trim().split('\t').map(Number);

      return { ahead, behind };
    } catch (error) {
      // No remote tracking branch or other error
      return null;
    }
  }
}
