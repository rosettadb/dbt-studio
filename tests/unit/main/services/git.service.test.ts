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
});
