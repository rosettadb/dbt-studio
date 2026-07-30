jest.mock('openai', () => ({
  OpenAI: jest.fn(),
}));

jest.mock('../../../../src/main/services/duckdb.service', () => ({
  __esModule: true,
  default: {
    getMetadata: jest.fn(),
    refreshMetadata: jest.fn(),
    reinitialize: jest.fn(),
    diagnose: jest.fn(),
    shutdown: jest.fn().mockResolvedValue(undefined),
    beginFactoryReset: jest.fn().mockResolvedValue(undefined),
    cancelFactoryReset: jest.fn(),
  },
}));

jest.mock('../../../../src/main/services/secureStorage.service', () => ({
  __esModule: true,
  default: {
    findCredentials: jest.fn().mockResolvedValue([]),
    deleteCredential: jest.fn(),
    clearAllCredentials: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../../../src/main/services/agent.service', () => ({
  __esModule: true,
  default: { cancelAllForFactoryReset: jest.fn() },
}));
jest.mock(
  '../../../../src/main/services/ai/agentEditorBridge.service',
  () => ({
    AgentEditorBridgeService: { resetForFactoryReset: jest.fn() },
  }),
);
jest.mock('../../../../src/main/services/taskManager.service', () => ({
  TaskManagerService: { cancelAll: jest.fn() },
}));
jest.mock('../../../../src/main/services/flowfile.service', () => ({
  FlowfileService: {
    stop: jest.fn().mockResolvedValue({ ok: true }),
  },
}));
jest.mock(
  '../../../../src/main/services/ai/mcp/mcpClientManager',
  () => ({
    MCPClientManager: { disconnectAll: jest.fn().mockResolvedValue(undefined) },
  }),
);
jest.mock('../../../../src/main/services/connectors.service', () => ({
  __esModule: true,
  default: { cleanupBigQueryKeyFiles: jest.fn() },
}));
jest.mock(
  '../../../../src/main/services/duckLake/connectionManager.service',
  () => ({
    __esModule: true,
    default: { disconnectAll: jest.fn().mockResolvedValue(undefined) },
  }),
);
jest.mock('../../../../src/main/services/duckLake/adapters', () => ({
  CatalogAdapterFactory: {
    disconnectAll: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../../../../src/main/services/mainDatabase.service', () => ({
  __esModule: true,
  default: {
    beginFactoryReset: jest.fn().mockResolvedValue(undefined),
    cancelFactoryReset: jest.fn(),
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
import fs from 'fs-extra';
import { app } from 'electron';
import SecureStorageService from '../../../../src/main/services/secureStorage.service';
import DuckDBBootstrap from '../../../../src/main/services/duckdb.service';
import MainDatabaseService from '../../../../src/main/services/mainDatabase.service';

describe('SettingsService (main)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (SettingsService as any).factoryResetPromise = null;
    (app.getPath as jest.Mock).mockImplementation((name: string) =>
      name === 'home' ? '/tmp/dbt-studio-home' : '/tmp/dbt-studio-user-data',
    );
    jest.spyOn(fs, 'pathExists').mockImplementation(async () => false);
    jest.spyOn(fs, 'remove').mockResolvedValue(undefined);
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('loadSettings', () => {
    it('returns existing settings when present in database', async () => {
      loadDatabaseFile.mockResolvedValue({ settings: { pythonPath: '/x/python' } });
      loadDefaultSettings.mockReturnValue({ pythonPath: '/default/python' });

      await expect(SettingsService.loadSettings()).resolves.toEqual({
        pythonPath: '/x/python',
      });
      expect(loadDefaultSettings).toHaveBeenCalled();
      expect(updateDatabase).not.toHaveBeenCalled();
    });

    it('returns default settings when persisted settings are missing', async () => {
      loadDatabaseFile.mockResolvedValue({ settings: {} });
      loadDefaultSettings.mockReturnValue({ pythonPath: '/default/python' });

      await expect(SettingsService.loadSettings()).resolves.toEqual({
        pythonPath: '/default/python',
      });
      expect(updateDatabase).not.toHaveBeenCalled();
    });
  });

  describe('resetFactorySettings', () => {
    const makeSession = () => ({
      clearStorageData: jest.fn().mockResolvedValue(undefined),
      clearCache: jest.fn().mockResolvedValue(undefined),
      closeAllConnections: jest.fn().mockResolvedValue(undefined),
    });

    it('stops resources, clears browser data and credentials, deletes owned state, and schedules restart', async () => {
      jest.useFakeTimers();
      loadDatabaseFile.mockResolvedValue({
        projects: [{ path: '/tmp/dbt-studio-project' }],
        settings: {
          rosettaPath:
            '/tmp/dbt-studio-home/.rosetta/rosetta-1-mac/rosetta-1-mac/bin/rosetta',
        },
      });
      const session = makeSession();

      await SettingsService.resetFactorySettings(session as any);

      expect(DuckDBBootstrap.beginFactoryReset).toHaveBeenCalled();
      expect(session.clearStorageData).toHaveBeenCalledWith();
      expect(session.clearCache).toHaveBeenCalledWith();
      expect(session.closeAllConnections).toHaveBeenCalledWith();
      expect(SecureStorageService.clearAllCredentials).toHaveBeenCalled();
      expect(fs.remove).toHaveBeenCalledWith('/tmp/dbt-studio-project');
      expect(fs.remove).toHaveBeenCalledWith(
        '/tmp/dbt-studio-user-data/main-database.db',
      );
      expect(fs.remove).toHaveBeenCalledWith(
        '/tmp/dbt-studio-user-data/main.duckdb',
      );
      expect(fs.remove).toHaveBeenCalledWith(
        '/tmp/dbt-studio-user-data/notebooks',
      );
      expect(fs.remove).toHaveBeenCalledWith(
        '/tmp/dbt-studio-home/.rosetta/rosetta-1-mac',
      );
      expect(app.relaunch).not.toHaveBeenCalled();

      jest.runOnlyPendingTimers();

      expect(app.relaunch).toHaveBeenCalled();
      expect(app.exit).toHaveBeenCalledWith(0);
    });

    it('does not restart when browser cleanup fails', async () => {
      loadDatabaseFile.mockResolvedValue({ projects: [], settings: {} });
      const session = makeSession();
      session.clearCache.mockRejectedValue(new Error('/secret/cache/path'));

      await expect(
        SettingsService.resetFactorySettings(session as any),
      ).rejects.toThrow('Factory reset failed while clearing browser data');

      expect(SecureStorageService.clearAllCredentials).not.toHaveBeenCalled();
      expect(DuckDBBootstrap.cancelFactoryReset).toHaveBeenCalled();
      expect(MainDatabaseService.cancelFactoryReset).toHaveBeenCalled();
      expect(app.relaunch).not.toHaveBeenCalled();
    });

    it('rejects an unsafe registered project before cleanup starts', async () => {
      loadDatabaseFile.mockResolvedValue({
        projects: [{ path: '/tmp/dbt-studio-home' }],
        settings: {},
      });
      const session = makeSession();

      await expect(
        SettingsService.resetFactorySettings(session as any),
      ).rejects.toThrow('registered project has an unsafe location');

      expect(session.clearStorageData).not.toHaveBeenCalled();
      expect(fs.remove).not.toHaveBeenCalled();
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
