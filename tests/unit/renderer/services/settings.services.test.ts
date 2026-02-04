import {
  getSettings,
  updateSettings,
  usePathJoin,
  setOpenAIKey,
  getOpenAIKey,
  deleteOpenAIKey,
  reinitializeDuckDb,
} from '../../../../src/renderer/services/settings.services';

jest.mock('../../../../src/renderer/config/client', () => {
  return {
    client: {
      get: jest.fn(),
      post: jest.fn(),
    },
  };
});

describe('renderer/services/settings.services', () => {
  const { client } = require('../../../../src/renderer/config/client');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSettings', () => {
    it('should call client.get with settings:load and return data', async () => {
      const settings = { rosettaPath: '/bin/rosetta' };
      client.get.mockResolvedValue({ data: settings });

      const result = await getSettings();

      expect(client.get).toHaveBeenCalledWith('settings:load');
      expect(result).toEqual(settings);
    });
  });

  describe('updateSettings', () => {
    it('should call client.post with settings:save and settings', async () => {
      client.post.mockResolvedValue({ data: undefined });

      const settings = { rosettaPath: '/bin/rosetta' } as any;
      await updateSettings(settings);

      expect(client.post).toHaveBeenCalledWith('settings:save', settings);
    });
  });

  describe('usePathJoin', () => {
    it('should call client.post with settings:usePathJoin and args array', async () => {
      client.post.mockResolvedValue({ data: '/a/b' });

      const result = await usePathJoin('/a', 'b');

      expect(client.post).toHaveBeenCalledWith('settings:usePathJoin', ['/a', 'b']);
      expect(result).toBe('/a/b');
    });
  });

  describe('secure storage helpers', () => {
    it('setOpenAIKey should call secure-storage:set with account + password', async () => {
      client.post.mockResolvedValue({ data: undefined });

      await setOpenAIKey('sk-test');

      expect(client.post).toHaveBeenCalledWith('secure-storage:set', {
        account: 'openai-api-key',
        password: 'sk-test',
      });
    });

    it('getOpenAIKey should call secure-storage:get and return data', async () => {
      client.post.mockResolvedValue({ data: 'sk-test' });

      const result = await getOpenAIKey();

      expect(client.post).toHaveBeenCalledWith('secure-storage:get', {
        account: 'openai-api-key',
      });
      expect(result).toBe('sk-test');
    });

    it('deleteOpenAIKey should call secure-storage:delete', async () => {
      client.post.mockResolvedValue({ data: undefined });

      await deleteOpenAIKey();

      expect(client.post).toHaveBeenCalledWith('secure-storage:delete', {
        account: 'openai-api-key',
      });
    });
  });

  describe('reinitializeDuckDb', () => {
    it('should call client.post with settings:duckdb:reinitialize and options', async () => {
      client.post.mockResolvedValue({ data: { ok: true } });

      const result = await reinitializeDuckDb({ dropExisting: true });

      expect(client.post).toHaveBeenCalledWith('settings:duckdb:reinitialize', {
        dropExisting: true,
      });
      expect(result).toEqual({ ok: true });
    });

    it('should call client.post with undefined options when omitted', async () => {
      client.post.mockResolvedValue({ data: { ok: true } });

      await reinitializeDuckDb();

      expect(client.post).toHaveBeenCalledWith('settings:duckdb:reinitialize', undefined);
    });
  });
});
