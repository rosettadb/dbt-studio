/* eslint class-methods-use-this: off */
import simpleGit, { SimpleGit } from 'simple-git';
import path from 'path';
import fs from 'fs';
import { AuthError } from '../errors';
import { FileStatus, GitCredentials } from '../../types/backend';
import SettingsService from './settings.service';

function getRepoNameFromUrl(url: string): string {
  const parts = url.split('/');
  let repoNameWithGit = parts[parts.length - 1];
  repoNameWithGit = repoNameWithGit.replace(/\.git$/, '');
  let clean = repoNameWithGit.replace(/[^\w]/g, '_');

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
    const gitDir = path.join(repoPath, '.git');
    if (!fs.existsSync(gitDir) || !fs.lstatSync(gitDir).isDirectory()) {
      throw new Error(`No .git directory found in: ${repoPath}`);
    }
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

    // Local branches
    local.all.forEach((localName) => {
      branchMap.set(localName, {
        name: localName,
        checkedOut: localName === current,
        isLocal: true,
        isRemote: false,
      });
    });

    // Remote branches
    remote.all.forEach((remoteName) => {
      if (remoteName.includes('->')) return; // Skip symbolic refs like origin/HEAD -> origin/main

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
    const gitDir = path.join(repoPath, '.git');
    const exists = fs.existsSync(gitDir);
    if (!exists) return false;

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

      // Temporarily override origin
      await git.remote(['set-url', 'origin', remoteWithAuth]);

      try {
        // Attempt to push normally first
        await git.push('origin', currentBranch);
      } catch (err: any) {
        const msg = err.message?.toLowerCase() ?? '';

        const shouldTryUpstreamPush =
          msg.includes('no upstream') ||
          msg.includes('requested upstream branch') ||
          msg.includes('set the upstream config') ||
          msg.includes('has no upstream');

        if (shouldTryUpstreamPush) {
          // Try setting upstream on push
          await git.push(['-u', 'origin', currentBranch]);
        } else {
          throw err;
        }
      }

      // Reset origin to clean version
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
      return { path: destinationPath, name: repoName };
    } catch (err: any) {
      if (isAuthError(err)) throw new AuthError();
      throw new Error(`Clone failed: ${err.message}`);
    }
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

    // Untracked
    status.not_added.forEach((file) =>
      results.push({ path: `${repoPath}/${file}`, status: 'untracked' }),
    );

    // Modified (unstaged)
    status.modified.forEach((file) =>
      results.push({ path: `${repoPath}/${file}`, status: 'modified' }),
    );

    // Staged files (added or modified)
    status.staged.forEach((file) =>
      results.push({ path: `${repoPath}/${file}`, status: 'staged' }),
    );

    // Deleted
    status.deleted.forEach((file) =>
      results.push({ path: `${repoPath}/${file}`, status: 'deleted' }),
    );

    // Renamed
    status.renamed.forEach((entry) =>
      results.push({ path: entry.to, status: 'renamed' }),
    );

    // Conflicted
    status.conflicted.forEach((file) =>
      results.push({ path: `${repoPath}/${file}`, status: 'conflicted' }),
    );

    return results;
  }
}
