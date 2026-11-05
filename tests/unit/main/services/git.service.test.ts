let gitMock: any;

jest.mock('simple-git', () => ({
  __esModule: true,
  default: jest.fn(() => gitMock),
}));

jest.mock('../../../../src/main/services/settings.service', () => ({
  __esModule: true,
  default: {
    loadSettings: jest.fn().mockResolvedValue({ projectsDirectory: '/tmp' }),
  },
}));

jest.mock('../../../../src/main/services/connectors.service', () => ({
  __esModule: true,
  default: {
    parseProjectConnectionFiles: jest.fn().mockResolvedValue({}),
    configureConnection: jest.fn(),
  },
}));

import GitService, { isAuthError } from '../../../../src/main/services/git.service';

describe('GitService (main)', () => {
  beforeEach(() => {
    gitMock = {
      status: jest.fn(),
      raw: jest.fn(),
      getRemotes: jest.fn(),
      log: jest.fn(),
      fetch: jest.fn(),
    };

    jest.clearAllMocks();
  });

  describe('isAuthError', () => {
    it('returns true for known auth error messages', () => {
      expect(
        isAuthError({ message: 'fatal: Authentication failed for https://x' }),
      ).toBe(true);

      expect(isAuthError({ stderr: 'Permission denied (publickey).' })).toBe(true);
    });

    it('returns false when error has no message/stderr', () => {
      expect(isAuthError({})).toBe(false);
      expect(isAuthError(null)).toBe(false);
    });
  });

  describe('isRepoInitialized', () => {
    it('returns true when git.status succeeds', async () => {
      gitMock.status.mockResolvedValue({});

      const service = new GitService();
      await expect(service.isRepoInitialized('/tmp/repo')).resolves.toBe(true);
      expect(gitMock.status).toHaveBeenCalled();
    });

    it('returns false when git.status throws', async () => {
      gitMock.status.mockRejectedValue(new Error('not a git repository'));

      const service = new GitService();
      await expect(service.isRepoInitialized('/tmp/repo')).resolves.toBe(false);
    });
  });

  describe('getAheadBehindCount', () => {
    it('returns null when tracking is not set', async () => {
      const service = new GitService();
      jest.spyOn(service, 'isTrackingSet').mockResolvedValue(false);

      await expect(service.getAheadBehindCount('/tmp/repo')).resolves.toBeNull();
      expect(gitMock.raw).not.toHaveBeenCalled();
    });

    it('parses ahead/behind values when tracking is set', async () => {
      const service = new GitService();
      jest.spyOn(service, 'isTrackingSet').mockResolvedValue(true);

      gitMock.raw.mockResolvedValue('2\t3');

      await expect(service.getAheadBehindCount('/tmp/repo')).resolves.toEqual({
        ahead: 2,
        behind: 3,
      });

      expect(gitMock.raw).toHaveBeenCalledWith([
        'rev-list',
        '--left-right',
        '--count',
        'HEAD...@{upstream}',
      ]);
    });

    it('returns null when git rev-list fails', async () => {
      const service = new GitService();
      jest.spyOn(service, 'isTrackingSet').mockResolvedValue(true);

      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      gitMock.raw.mockRejectedValue(new Error('no upstream configured'));

      await expect(service.getAheadBehindCount('/tmp/repo')).resolves.toBeNull();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('getProjectGitSummary', () => {
    const mockRepo = ({
      tracking = 'origin/main',
      originUrl = 'https://github.com/org/repo.git',
    }: { tracking?: string | null; originUrl?: string | null } = {}) => {
      gitMock.status.mockResolvedValue({
        current: 'main',
        tracking,
        ahead: 1,
        behind: 2,
        files: [{ path: 'a.sql' }, { path: 'b.sql' }],
      });
      gitMock.getRemotes.mockResolvedValue(
        originUrl ? [{ name: 'origin', refs: { fetch: originUrl } }] : [],
      );
      gitMock.log.mockResolvedValue({
        latest: {
          message: 'Add models',
          author_name: 'Jane',
          date: '2026-11-01T10:00:00+00:00',
        },
      });
    };

    it('returns the branch, remote, ahead/behind, changes and last commit', async () => {
      mockRepo();

      const service = new GitService();

      await expect(service.getProjectGitSummary('/tmp/repo')).resolves.toEqual({
        currentBranch: 'main',
        remoteDisplayAddress: 'github.com/org/repo',
        aheadBehind: { ahead: 1, behind: 2 },
        changedFileCount: 2,
        lastCommit: {
          message: 'Add models',
          authorName: 'Jane',
          date: '2026-11-01T10:00:00+00:00',
        },
      });
    });

    it('asks for the remote with its URL, and only reads the latest commit', async () => {
      mockRepo();

      await new GitService().getProjectGitSummary('/tmp/repo');

      expect(gitMock.getRemotes).toHaveBeenCalledWith(true);
      expect(gitMock.log).toHaveBeenCalledWith({ maxCount: 1 });
    });

    it('never fetches, so it stays fast and cannot trigger a login prompt', async () => {
      mockRepo();

      await new GitService().getProjectGitSummary('/tmp/repo');

      expect(gitMock.fetch).not.toHaveBeenCalled();
    });

    it.each([
      ['https://github.com/org/repo.git', 'github.com/org/repo'],
      ['https://github.com/org/repo', 'github.com/org/repo'],
      ['https://github.com/org/repo/', 'github.com/org/repo'],
      ['https://user:s3cret@github.com/org/repo.git', 'github.com/org/repo'],
      ['https://oauth2:p@ss@gitlab.com/org/repo.git', 'gitlab.com/org/repo'],
      ['git@github.com:org/repo.git', 'github.com/org/repo'],
      ['ssh://git@github.com/org/repo.git', 'github.com/org/repo'],
      ['ssh://git@git.example.com:2222/org/repo.git', 'git.example.com:2222/org/repo'],
    ])('shows the remote %s as %s', async (originUrl, expected) => {
      mockRepo({ originUrl });

      const summary = await new GitService().getProjectGitSummary('/tmp/repo');

      expect(summary?.remoteDisplayAddress).toBe(expected);
    });

    it('never returns saved login details from the remote URL', async () => {
      mockRepo({ originUrl: 'https://user:s3cret-token@github.com/org/repo.git' });

      const summary = await new GitService().getProjectGitSummary('/tmp/repo');

      expect(JSON.stringify(summary)).not.toContain('s3cret-token');
      expect(JSON.stringify(summary)).not.toContain('user');
    });

    it('returns no remote when the repository has no origin', async () => {
      mockRepo({ originUrl: null });

      const summary = await new GitService().getProjectGitSummary('/tmp/repo');

      expect(summary?.remoteDisplayAddress).toBeNull();
    });

    it('returns no ahead/behind when the branch does not track a remote branch', async () => {
      mockRepo({ tracking: null });

      const summary = await new GitService().getProjectGitSummary('/tmp/repo');

      expect(summary?.aheadBehind).toBeNull();
    });

    it('still returns the rest of the summary when git log fails', async () => {
      mockRepo();
      gitMock.log.mockRejectedValue(new Error('does not have any commits yet'));

      const summary = await new GitService().getProjectGitSummary('/tmp/repo');

      expect(summary?.lastCommit).toBeNull();
      expect(summary?.currentBranch).toBe('main');
    });

    it('returns no last commit when git log finds nothing', async () => {
      mockRepo();
      gitMock.log.mockResolvedValue({ latest: null });

      const summary = await new GitService().getProjectGitSummary('/tmp/repo');

      expect(summary?.lastCommit).toBeNull();
    });

    it('returns null when the folder is not a Git repository', async () => {
      gitMock.status.mockRejectedValue(new Error('not a git repository'));

      await expect(
        new GitService().getProjectGitSummary('/tmp/repo'),
      ).resolves.toBeNull();
    });
  });
});
