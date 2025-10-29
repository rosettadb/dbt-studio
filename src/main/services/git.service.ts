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

    const readmePath = path.join(repoPath, 'README.md');
    await fs.promises.writeFile(
      readmePath,
      `# ${repoPath.split('/').slice(-1)[0]}\n`,
    );

    await git.add('README.md');
    await git.commit('Initial commit');
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
      await git.add(files);
      return { success: true };
    } catch (err: any) {
      throw new Error(`Add failed: ${err.message}`);
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
      const diff = await git.diff([filePath]);
      return { filePath, diff };
    } catch (err: any) {
      throw new Error(`Failed to get diff: ${err.message}`);
    }
  }

  async getFileStatusList(repoPath: string): Promise<FileStatus[]> {
    const git = this.getGitInstance(repoPath);
    const status = await git.status();
    const results: FileStatus[] = [];

    status.not_added.forEach((file) =>
      results.push({ path: path.join(repoPath, file), status: 'untracked' }),
    );

    status.modified.forEach((file) =>
      results.push({ path: path.join(repoPath, file), status: 'modified' }),
    );

    status.staged.forEach((file) =>
      results.push({ path: path.join(repoPath, file), status: 'staged' }),
    );

    status.deleted.forEach((file) =>
      results.push({ path: path.join(repoPath, file), status: 'deleted' }),
    );

    status.renamed.forEach((entry) =>
      results.push({ path: path.join(repoPath, entry.to), status: 'renamed' }),
    );

    status.conflicted.forEach((file) =>
      results.push({ path: path.join(repoPath, file), status: 'conflicted' }),
    );

    return results;
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

  /**
   * Check if there are any untracked files in the repository
   */
  async hasUntrackedChanges(repoPath: string): Promise<boolean> {
    try {
      const git = this.getGitInstance(repoPath);
      const status = await git.status();
      return status.not_added.length > 0;
    } catch (err: any) {
      throw new Error(`Failed to check untracked changes: ${err.message}`);
    }
  }

  /**
   * Check if there are any uncommitted changes (modified, deleted, or staged files)
   */
  async hasUncommittedChanges(repoPath: string): Promise<boolean> {
    try {
      const git = this.getGitInstance(repoPath);
      const status = await git.status();

      return (
        status.modified.length > 0 ||
        status.deleted.length > 0 ||
        status.staged.length > 0 ||
        status.renamed.length > 0 ||
        status.conflicted.length > 0
      );
    } catch (err: any) {
      throw new Error(`Failed to check uncommitted changes: ${err.message}`);
    }
  }

  /**
   * Check if there are any unpushed commits on the current branch
   */
  async hasUnpushedChanges(repoPath: string): Promise<boolean> {
    try {
      const git = this.getGitInstance(repoPath);

      // Get current branch
      const branchSummary = await git.branch();
      const currentBranch = branchSummary.current;

      if (!currentBranch) {
        return false;
      }

      // Fetch to get latest remote info (without merging)
      try {
        await git.fetch();
      } catch (err) {
        return false;
      }

      // Check if remote branch exists
      const remoteBranches = await git.branch(['-r']);
      const hasRemoteBranch = remoteBranches.all.includes(
        `origin/${currentBranch}`,
      );

      if (!hasRemoteBranch) {
        // If there's no remote branch, check if there are any commits
        const log = await git.log();
        return log.total > 0;
      }

      // Compare local and remote
      const result = await git.raw([
        'rev-list',
        '--count',
        `origin/${currentBranch}..HEAD`,
      ]);

      const unpushedCount = parseInt(result.trim(), 10);
      return unpushedCount > 0;
    } catch (err: any) {
      throw new Error(`Failed to check unpushed changes: ${err.message}`);
    }
  }

  /**
   * Check if there are any local changes (untracked, uncommitted, or unpushed)
   */
  async hasLocalChanges(repoPath: string): Promise<boolean> {
    try {
      const [hasUntracked, hasUncommitted, hasUnpushed] = await Promise.all([
        this.hasUntrackedChanges(repoPath),
        this.hasUncommittedChanges(repoPath),
        this.hasUnpushedChanges(repoPath),
      ]);

      return hasUntracked || hasUncommitted || hasUnpushed;
    } catch (err: any) {
      throw new Error(`Failed to check local changes: ${err.message}`);
    }
  }

  /**
   * Get detailed information about local changes
   */
  async getLocalChangesStatus(repoPath: string): Promise<{
    hasUntracked: boolean;
    hasUncommitted: boolean;
    hasUnpushed: boolean;
    untrackedCount: number;
    uncommittedCount: number;
    unpushedCount: number;
  }> {
    try {
      const git = this.getGitInstance(repoPath);
      const status = await git.status();

      const hasUntracked = status.not_added.length > 0;
      const hasUncommitted =
        status.modified.length > 0 ||
        status.deleted.length > 0 ||
        status.staged.length > 0 ||
        status.renamed.length > 0 ||
        status.conflicted.length > 0;

      const uncommittedCount =
        status.modified.length +
        status.deleted.length +
        status.staged.length +
        status.renamed.length +
        status.conflicted.length;

      let hasUnpushed = false;
      let unpushedCount = 0;

      try {
        const branchSummary = await git.branch();
        const currentBranch = branchSummary.current;

        if (currentBranch) {
          await git.fetch();
          const remoteBranches = await git.branch(['-r']);
          const hasRemoteBranch = remoteBranches.all.includes(
            `origin/${currentBranch}`,
          );

          if (hasRemoteBranch) {
            const result = await git.raw([
              'rev-list',
              '--count',
              `origin/${currentBranch}..HEAD`,
            ]);
            unpushedCount = parseInt(result.trim(), 10);
            hasUnpushed = unpushedCount > 0;
          } else {
            const log = await git.log();
            unpushedCount = log.total;
            hasUnpushed = log.total > 0;
          }
        }
      } catch (err) {
        // If we can't determine unpushed status, just return false
        hasUnpushed = false;
        unpushedCount = 0;
      }

      return {
        hasUntracked,
        hasUncommitted,
        hasUnpushed,
        untrackedCount: status.not_added.length,
        uncommittedCount,
        unpushedCount,
      };
    } catch (err: any) {
      throw new Error(`Failed to get local changes status: ${err.message}`);
    }
  }
}
