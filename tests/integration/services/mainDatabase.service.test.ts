// Mock electron BEFORE imports
// We use a fixed temp directory name so we can reference it in the mock factory
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import MainDatabaseService from '../../../src/main/services/mainDatabase.service';

const TEST_DIR_NAME = 'dbt-studio-int-test-static';

jest.mock('electron', () => {
  // Use distinct variable names to avoid shadowing if imports are hoisted
  // eslint-disable-next-line global-require
  const osModule = require('os');
  // eslint-disable-next-line global-require
  const pathModule = require('path');
  const targetDir = pathModule.join(
    osModule.tmpdir(),
    'dbt-studio-int-test-static',
  );

  return {
    app: {
      getPath: jest.fn().mockImplementation((name) => {
        if (name === 'userData') return targetDir;
        return '';
      }),
    },
  };
});

describe('MainDatabaseService Integration', () => {
  const testUserDataPath = path.join(os.tmpdir(), TEST_DIR_NAME);

  beforeAll(() => {
    // Ensure directory exists because MainDatabaseService expects it for the DB file
    if (!fs.existsSync(testUserDataPath)) {
      fs.mkdirSync(testUserDataPath, { recursive: true });
    }
  });

  afterAll(() => {
    // Cleanup using type casting to access private static properties
    const Service = MainDatabaseService as any;
    if (Service.sqlite) {
      Service.sqlite.close();
      Service.sqlite = null;
      Service.db = null;
    }

    // Give it a moment to release file handles if any
    try {
      if (fs.existsSync(testUserDataPath)) {
        fs.rmSync(testUserDataPath, { recursive: true, force: true });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Could not cleanup test directory:', e);
    }
  });

  beforeEach(async () => {
    // Initialize database
    await MainDatabaseService.initializeDatabase();
  });

  afterEach(async () => {
    // Close connection after each test to allow cleanup or fresh start
    // Using explicit casting to access private properties (sqlite, db) without modifying the source code
    const Service = MainDatabaseService as any;
    if (Service.sqlite) {
      Service.sqlite.close();
      Service.sqlite = null;
      Service.db = null;
    }

    const dbFile = path.join(testUserDataPath, 'main-database.db');
    if (fs.existsSync(dbFile)) {
      try {
        fs.unlinkSync(dbFile);
      } catch (e) {
        // Ignore unlink errors in afterEach, rely on next init or full cleanup
      }
    }
  });

  describe('AI Provider Management', () => {
    it('should save and retrieve an AI provider', async () => {
      const newProvider = {
        name: 'Test Provider',
        type: 'openai',
        config: JSON.stringify({ apiKey: 'test-key' }),
        isActive: true,
      };

      const saved = await MainDatabaseService.saveProvider(newProvider);
      expect(saved.id).toBeDefined();
      expect(saved.name).toBe(newProvider.name);

      const retrieved = await MainDatabaseService.getProvider(saved.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe(newProvider.name);
    });

    it('should list all providers', async () => {
      await MainDatabaseService.saveProvider({
        name: 'Provider 1',
        type: 'openai',
        config: '{}',
        isActive: false,
      });

      await MainDatabaseService.saveProvider({
        name: 'Provider 2',
        type: 'anthropic',
        config: '{}',
        isActive: true,
      });

      const providers = await MainDatabaseService.getProviders();
      expect(providers).toHaveLength(2);
    });
  });

  describe('Conversation Management', () => {
    it('should create a conversation', async () => {
      const conversation = await MainDatabaseService.createConversation(
        'Test Chat',
        1,
      );
      expect(conversation.id).toBeDefined();
      expect(conversation.title).toBe('Test Chat');
    });
  });
});
