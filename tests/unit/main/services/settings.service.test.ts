jest.mock('openai', () => ({
  OpenAI: jest.fn(),
}));

jest.mock('../../../../src/main/services', () => ({
  DuckDBBootstrap: {
    getMetadata: jest.fn(),
    refreshMetadata: jest.fn(),
    reinitialize: jest.fn(),
    diagnose: jest.fn(),
  },
  SecureStorageService: {
    findCredentials: jest.fn().mockResolvedValue([]),
    deleteCredential: jest.fn(),
  },
}));

const loadDatabaseFile = jest.fn();
const updateDatabase = jest.fn();
const loadDefaultSettings = jest.fn();

jest.mock('../../../../src/main/utils/fileHelper', () => ({
  loadDatabaseFile: (...args: any[]) => loadDatabaseFile(...args),
  updateDatabase: (...args: any[]) => updateDatabase(...args),
  loadDefaultSettings: (...args: any[]) => loadDefaultSettings(...args),
  deleteDirectory: jest.fn(),
}));

jest.mock('../../../../src/main/utils/setupHelpers', () => ({
  DB_FILE: '/tmp/db.json',
  initializeDataStorage: jest.fn(),
}));

jest.mock('../../../../src/main/adapters', () => ({
  CliAdapter: jest.fn().mockImplementation(() => ({
    runCommandWithoutStreaming: jest.fn(),
  })),
}));

import SettingsService from '../../../../src/main/services/settings.service';

describe('SettingsService (main)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadSettings', () => {
    it('returns existing settings when present in database', async () => {
      loadDatabaseFile.mockResolvedValue({ settings: { pythonPath: '/x/python' } });

      await expect(SettingsService.loadSettings()).resolves.toEqual({
        pythonPath: '/x/python',
      });
      expect(loadDefaultSettings).not.toHaveBeenCalled();
      expect(updateDatabase).not.toHaveBeenCalled();
    });

    it('writes and returns default settings when settings are missing', async () => {
      loadDatabaseFile.mockResolvedValue({});
      loadDefaultSettings.mockReturnValue({ pythonPath: '/default/python' });

      await expect(SettingsService.loadSettings()).resolves.toEqual({
        pythonPath: '/default/python',
      });
      expect(updateDatabase).toHaveBeenCalledWith('settings', {
        pythonPath: '/default/python',
      });
    });
  });

  describe('usePathJoin', () => {
    it('joins path chunks', async () => {
      await expect(SettingsService.usePathJoin(['a', 'b'])).resolves.toContain('a');
    });
  });

  describe('getFileName', () => {
    it('returns the basename without extension', async () => {
      await expect(SettingsService.getFileName(['a', 'b', 'file.sql'])).resolves.toBe(
        'file',
      );
    });
  });
});
