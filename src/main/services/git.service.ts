/* eslint class-methods-use-this: off */
import simpleGit, { SimpleGit } from 'simple-git';
import path from 'path';
import fs from 'fs';
import { AuthError } from '../errors';
import {
  FileStatus,
  GitChangesRes,
  GitCredentials,
  RepoInfoRes,
} from '../../types/backend';
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
  private static lockFileRetries = 3;

  private static lockFileRetryDelay = 100;

  // Operation queue to prevent concurrent git operations on same repo
  private static operationQueues: Map<string, Promise<any>> = new Map();

  getGitInstance(repoPath: string): SimpleGit {
    return simpleGit(repoPath);
  }

  private async queueOperation<T>(
    repoPath: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    // Get or create queue for this repo
    const currentQueue =
      GitService.operationQueues.get(repoPath) || Promise.resolve();

    // Chain this operation after the current queue
    const newQueue = currentQueue
      .then(() => operation())
      .catch((err) => {
        // Don't let one failed operation break the queue
        throw err;
      });

    // Update the queue
    GitService.operationQueues.set(repoPath, newQueue);

    try {
      return await newQueue;
    } finally {
      // Clean up if this was the last operation
      if (GitService.operationQueues.get(repoPath) === newQueue) {
        GitService.operationQueues.delete(repoPath);
      }
    }
  }

  private async removeLockFileIfStale(repoPath: string): Promise<void> {
    const lockFilePath = path.join(repoPath, '.git', 'index.lock');
    try {
      const exists = fs.existsSync(lockFilePath);
      if (exists) {
        // Check if lock file is stale (older than 10 seconds for more aggressive cleanup)
        const stats = fs.statSync(lockFilePath);
        const ageInMs = Date.now() - stats.mtimeMs;
        const tenSecondsInMs = 10 * 1000;

        if (ageInMs > tenSecondsInMs) {
          // eslint-disable-next-line no-console
          console.log('Removing stale git lock file');
          fs.unlinkSync(lockFilePath);
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error checking/removing lock file:', error);
    }
  }

  async clearLockFile(repoPath: string): Promise<void> {
    const lockFilePath = path.join(repoPath, '.git', 'index.lock');
    try {
      if (fs.existsSync(lockFilePath)) {
        fs.unlinkSync(lockFilePath);
        // eslint-disable-next-line no-console
        console.log('Cleared git lock file');
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error clearing lock file:', error);
      throw new Error('Failed to clear git lock file');
    }
  }

  private async retryWithLockHandling<T>(
    repoPath: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    let lastError: any;

    for (let i = 0; i < GitService.lockFileRetries; i += 1) {
      try {
        // Always check for stale lock before attempting operation
        if (i > 0) {
          // eslint-disable-next-line no-await-in-loop
          await this.removeLockFileIfStale(repoPath);
        }

        // eslint-disable-next-line no-await-in-loop
        return await operation();
      } catch (error: any) {
        lastError = error;
        const errorMsg = error.message?.toLowerCase() || '';

        if (errorMsg.includes('index.lock')) {
          // Always try to remove lock file on lock errors
          // eslint-disable-next-line no-await-in-loop
          await this.removeLockFileIfStale(repoPath);

          if (i < GitService.lockFileRetries - 1) {
            // Wait before retrying with exponential backoff
            // eslint-disable-next-line no-await-in-loop
            await new Promise((resolve) => {
              setTimeout(resolve, GitService.lockFileRetryDelay * (i + 1));
            });
          }
        } else {
          // Not a lock file error, throw immediately
          throw error;
        }
      }
    }

    throw lastError;
  }

  async isTrackingSet(repoPath: string): Promise<boolean> {
    const git = this.getGitInstance(repoPath);
    const result = await git.raw(['status', '-sb']);
    const firstLine = result.trim().split('\n')[0];
    const hasTracking = firstLine.includes('...');
    // eslint-disable-next-line no-console
    console.log(
      '[GitService.isTrackingSet] Status line:',
      firstLine,
      'hasTracking:',
      hasTracking,
    );
    return hasTracking;
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

    try {
      // First, check if we have any remotes configured
      const remotes = await git.getRemotes();
      const hasRemotes = remotes.length > 0;

      // Only fetch if we have remotes
      if (hasRemotes) {
        try {
          await git.fetch();
        } catch (fetchErr: any) {
          // eslint-disable-next-line no-console
          console.error(
            'Fetch failed, continuing with local branches:',
            fetchErr,
          );
          // Continue even if fetch fails - we can still checkout local branches
        }
      }

      const localBranches = await git.branchLocal();
      const hasLocal = localBranches.all.includes(branchName);

      let hasRemote = false;
      if (hasRemotes) {
        const remoteBranches = await git.branch(['-r']);
        hasRemote = remoteBranches.all.includes(`origin/${branchName}`);
      }

      if (hasLocal) {
        // Branch exists locally, just checkout
        await git.checkout(branchName);
        // Try to set upstream if remote branch exists
        if (hasRemote) {
          try {
            await this.ensureTrackingUpstream(repoPath, branchName);
          } catch (upstreamErr: any) {
            // eslint-disable-next-line no-console
            console.error('Failed to set upstream tracking:', upstreamErr);
            // Continue even if upstream tracking fails
          }
        }
      } else if (hasRemote) {
        // Branch exists on remote but not locally, create local tracking branch
        await git.checkout([
          '-b',
          branchName,
          '--track',
          `origin/${branchName}`,
        ]);
      } else {
        // Branch doesn't exist anywhere, create new local branch
        await git.checkoutLocalBranch(branchName);
      }

      return { success: true, checkedOut: branchName };
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('Checkout error:', err);
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
    return this.queueOperation(repoPath, () =>
      this.retryWithLockHandling(repoPath, async () => {
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

          // Get current git status to check what needs staging
          const status = await git.status();

          const filesToAdd: string[] = [];
          const filesToUpdate: string[] = [];

          relativePaths.forEach((file) => {
            if (file === '.') {
              filesToAdd.push(file);
              return;
            }

            // Check if file is already staged
            const isStaged = status.staged.includes(file);

            // Check if file exists on filesystem
            const fullPath = path.join(repoPath, file);
            const exists = fs.existsSync(fullPath);

            if (isStaged) {
              // File is already staged, skip it
              return;
            }

            if (exists) {
              // File exists, add it normally
              filesToAdd.push(file);
            } else if (status.deleted.includes(file)) {
              // File is deleted but not staged, use -u flag
              filesToUpdate.push(file);
            }
          });

          // Stage existing/new files
          if (filesToAdd.length > 0) {
            await git.add(filesToAdd);
          }

          // Stage deleted files with -u flag
          if (filesToUpdate.length > 0) {
            await git.add(['-u', ...filesToUpdate]);
          }

          return { success: true };
        } catch (err: any) {
          // eslint-disable-next-line no-console
          console.error('Git add failed:', err);
          throw new Error(`Add failed: ${err.message}`);
        }
      }),
    );
  }

  async unstage(repoPath: string, files: string[]) {
    return this.queueOperation(repoPath, () =>
      this.retryWithLockHandling(repoPath, async () => {
        const git = this.getGitInstance(repoPath);

        try {
          // Convert absolute paths to relative paths for git
          const relativePaths = files.map((file) => {
            if (!path.isAbsolute(file)) {
              return file;
            }
            return path.relative(repoPath, file);
          });

          // For renamed files, git reset HEAD works on the new filename
          // Git will automatically handle the rename and restore both old and new files
          await git.reset(['HEAD', ...relativePaths]);
          return { success: true };
        } catch (err: any) {
          // eslint-disable-next-line no-console
          console.error('Unstage failed:', err);
          throw new Error(`Unstage failed: ${err.message}`);
        }
      }),
    );
  }

  async stageAll(repoPath: string) {
    return this.queueOperation(repoPath, () =>
      this.retryWithLockHandling(repoPath, async () => {
        const git = this.getGitInstance(repoPath);

        try {
          // Use -A flag to stage all changes including deletions and renames
          await git.add(['-A']);
          return { success: true };
        } catch (err: any) {
          throw new Error(`Stage all failed: ${err.message}`);
        }
      }),
    );
  }

  async unstageAll(repoPath: string) {
    return this.queueOperation(repoPath, () =>
      this.retryWithLockHandling(repoPath, async () => {
        const git = this.getGitInstance(repoPath);

        try {
          await git.reset(['HEAD']);
          return { success: true };
        } catch (err: any) {
          throw new Error(`Unstage all failed: ${err.message}`);
        }
      }),
    );
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

      // Get status to check which files are untracked
      const status = await git.status();
      const untrackedFiles: string[] = [];
      const trackedFiles: string[] = [];

      relativePaths.forEach((file) => {
        if (status.not_added.includes(file)) {
          untrackedFiles.push(file);
        } else if (
          status.modified.includes(file) ||
          status.deleted.includes(file) ||
          status.staged.includes(file)
        ) {
          trackedFiles.push(file);
        }
      });

      // Discard changes for tracked files
      if (trackedFiles.length > 0) {
        try {
          await git.checkout(['--', ...trackedFiles]);
        } catch (checkoutErr: any) {
          // eslint-disable-next-line no-console
          console.error('Checkout failed for some files:', checkoutErr);
          // Continue to try cleaning untracked files
        }
      }

      // Delete untracked files
      if (untrackedFiles.length > 0) {
        try {
          // Delete untracked files manually since git clean with specific files is tricky
          const fsPromises = fs.promises;
          await Promise.all(
            untrackedFiles.map(async (file) => {
              const fullPath = path.join(repoPath, file);
              try {
                await fsPromises.unlink(fullPath);
              } catch (unlinkErr) {
                // eslint-disable-next-line no-console
                console.error(`Failed to delete ${file}:`, unlinkErr);
              }
            }),
          );
        } catch (cleanErr: any) {
          // eslint-disable-next-line no-console
          console.error('Clean failed for some files:', cleanErr);
        }
      }

      return { success: true };
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('Discard changes error:', err);
      throw new Error(`Discard changes failed: ${err.message}`);
    }
  }

  async commit(repoPath: string, message: string, files: string[] = ['.']) {
    return this.queueOperation(repoPath, () =>
      this.retryWithLockHandling(repoPath, async () => {
        const git = this.getGitInstance(repoPath);

        try {
          await git.add(files);
          await git.commit(message);

          // Check and ensure tracking is set after commit
          const branchSummary = await git.branch();
          const currentBranch = branchSummary.current;

          // Check if tracking is already set
          const isTracking = await this.isTrackingSet(repoPath);

          // If not tracking and we have a remote, try to set it
          if (!isTracking) {
            const remotes = await git.getRemotes();
            if (remotes.length > 0) {
              try {
                await git.branch([
                  '--set-upstream-to',
                  `origin/${currentBranch}`,
                  currentBranch,
                ]);
              } catch (upstreamErr: any) {
                // Ignore errors when upstream doesn't exist yet
              }
            }
          }

          return { success: true };
        } catch (err: any) {
          // eslint-disable-next-line no-console
          console.error('[GitService.commit] Commit failed:', err);
          throw new Error(`Commit failed: ${err.message}`);
        }
      }),
    );
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

      // Check if tracking is set before pushing
      const isTracking = await this.isTrackingSet(repoPath);

      try {
        // Always use -u flag if tracking is not set to ensure upstream is configured
        if (!isTracking) {
          await git.push(['-u', 'origin', currentBranch]);
        } else {
          await git.push('origin', currentBranch);
        }
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
      // eslint-disable-next-line no-console
      console.error('[GitService.push] Push failed:', err);
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
      let filePath = line.substring(3); // File path (skip 'XY ' - 2 status chars + 1 space)

      // Handle renamed files: "old -> new" format
      // For renamed files, we want to track the NEW filename
      if (filePath.includes(' -> ')) {
        const [, newFilePath] = filePath.split(' -> ');
        filePath = newFilePath; // Use the new filename
      }

      const fullPath = path.join(repoPath, filePath);

      // Skip directories
      if (filePath.endsWith('/')) {
        return;
      }

      processedFiles.add(fullPath);

      // Handle staged changes (index status)
      if (indexStatus !== ' ' && indexStatus !== '?') {
        let status: 'staged' | 'renamed' | 'staged-deleted';
        switch (indexStatus) {
          case 'A':
            status = 'staged';
            break;
          case 'M':
            status = 'staged';
            break;
          case 'D':
            status = 'staged-deleted'; // Staged deletion - distinct from unstaged deletion
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
            status = 'deleted'; // Unstaged deletion
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
  async getLocalChangesStatus(repoPath: string): Promise<GitChangesRes | null> {
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
      return null;
    }
  }

  async getRepoInfo(repoPath: string): Promise<RepoInfoRes | null> {
    const git = this.getGitInstance(repoPath);

    try {
      const remotes = await git.getRemotes(true);
      const origin = remotes.find((r) => r.name === 'origin');
      let remoteUrl = origin?.refs?.fetch || null;

      if (remoteUrl && !remoteUrl.endsWith('.git')) {
        remoteUrl = `${remoteUrl}.git`;
      }

      const branchSummary = await git.branch();
      const currentBranch = branchSummary.current;

      let branchExistsOnRemote = false;
      if (currentBranch) {
        try {
          await git.fetch();
          const remoteBranches = await git.branch(['-r']);
          branchExistsOnRemote = remoteBranches.all.includes(
            `origin/${currentBranch}`,
          );
        } catch (err) {
          branchExistsOnRemote = false;
        }
      }

      return {
        remoteUrl,
        currentBranch,
        branchExistsOnRemote,
      };
    } catch (err: any) {
      return null;
    }
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
      // eslint-disable-next-line no-console
      console.error('[GitService.getAheadBehindCount] Error:', error);
      // No remote tracking branch or other error
      return null;
    }
  }

  async createBranch(repoPath: string, branchName: string) {
    return this.queueOperation(repoPath, async () => {
      const git = this.getGitInstance(repoPath);
      await git.checkoutLocalBranch(branchName);
      return { success: true, branchName };
    });
  }

  async deleteBranch(
    repoPath: string,
    branchName: string,
    force: boolean = false,
  ) {
    return this.queueOperation(repoPath, async () => {
      const git = this.getGitInstance(repoPath);
      if (force) {
        await git.deleteLocalBranch(branchName, true);
      } else {
        await git.deleteLocalBranch(branchName);
      }
      return { success: true, branchName };
    });
  }

  async renameBranch(repoPath: string, oldName: string, newName: string) {
    return this.queueOperation(repoPath, async () => {
      const git = this.getGitInstance(repoPath);
      await git.branch(['-m', oldName, newName]);
      return { success: true, oldName, newName };
    });
  }
}
