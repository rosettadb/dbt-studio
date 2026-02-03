import {
  gitClone,
  isInitialized,
  addRemote,
  add,
  commit,
  getFileStatusList,
} from '../../../../src/renderer/services/git.service';

jest.mock('../../../../src/renderer/config/client', () => {
  return {
    client: {
      get: jest.fn(),
      post: jest.fn(),
    },
  };
});

describe('renderer/services/git.service', () => {
  const { client } = require('../../../../src/renderer/config/client');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('gitClone', () => {
    it('should call client.post with git:clone and url/credentials and return data', async () => {
      const response = { path: '/tmp/repo', name: 'repo' };
      client.post.mockResolvedValue({ data: response });

      const result = await gitClone('https://github.com/org/repo.git');

      expect(client.post).toHaveBeenCalledWith('git:clone', {
        url: 'https://github.com/org/repo.git',
        credentials: undefined,
        removeGit: undefined,
      });
      expect(result).toEqual(response);
    });
  });

  describe('isInitialized', () => {
    it('should call client.post with git:isInitialized and optional path', async () => {
      client.post.mockResolvedValue({ data: true });

      const result = await isInitialized('/tmp/repo');

      expect(client.post).toHaveBeenCalledWith(
        'git:isInitialized',
        '/tmp/repo',
      );
      expect(result).toBe(true);
    });
  });

  describe('addRemote', () => {
    it('should call client.post with git:addRemote and repoPath/remoteUrl', async () => {
      client.post.mockResolvedValue({ data: undefined });

      await addRemote('/tmp/repo', 'https://example.com/remote.git');

      expect(client.post).toHaveBeenCalledWith('git:addRemote', {
        repoPath: '/tmp/repo',
        remoteUrl: 'https://example.com/remote.git',
      });
    });
  });

  describe('add', () => {
    it('should call client.post with git:add and files and return data', async () => {
      client.post.mockResolvedValue({ data: { success: true } });

      const result = await add('/tmp/repo', ['a.sql']);

      expect(client.post).toHaveBeenCalledWith('git:add', {
        repoPath: '/tmp/repo',
        files: ['a.sql'],
      });
      expect(result).toEqual({ success: true });
    });
  });

  describe('commit', () => {
    it('should call client.post with git:commit and payload', async () => {
      client.post.mockResolvedValue({ data: undefined });

      await commit('/tmp/repo', 'msg', ['a.sql']);

      expect(client.post).toHaveBeenCalledWith('git:commit', {
        repoPath: '/tmp/repo',
        message: 'msg',
        files: ['a.sql'],
      });
    });
  });

  describe('getFileStatusList', () => {
    it('should call client.post with git:fileStatusList and body and return data', async () => {
      const statuses = [{ path: 'a.sql', status: 'modified' }];
      client.post.mockResolvedValue({ data: statuses });

      const result = await getFileStatusList('/tmp/repo');

      expect(client.post).toHaveBeenCalledWith('git:fileStatusList', {
        repoPath: '/tmp/repo',
      });
      expect(result).toEqual(statuses);
    });
  });
});
