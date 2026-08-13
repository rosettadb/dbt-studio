// Mock electron BEFORE imports
// We use a fixed temp directory name so we can reference it in the mock factory
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import MainDatabaseService from '../../../src/main/services/mainDatabase.service';

const TEST_DIR_NAME = 'dbt-studio-int-test-static';
const canRunBetterSqliteIntegration = () => {
  try {
    // Try packaged path first
    const appPath = process.cwd();
    const betterSqlitePath = path.join(
      appPath,
      'release',
      'app',
      'node_modules',
      'better-sqlite3',
    );
    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      require(betterSqlitePath);
      return true;
    } catch {
      // Fallback to regular require (for dev environments/standard node)
      // eslint-disable-next-line global-require
      require('better-sqlite3');
      return true;
    }
  } catch (e) {
    return false;
  }
};
const describeBetterSqlite = canRunBetterSqliteIntegration()
  ? describe
  : describe.skip;

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

describeBetterSqlite('MainDatabaseService Integration', () => {
  const testUserDataPath = path.join(os.tmpdir(), TEST_DIR_NAME);

  beforeAll(() => {
    // Clear any existing test directory and recreate it to ensure clean state
    if (fs.existsSync(testUserDataPath)) {
      fs.rmSync(testUserDataPath, { recursive: true, force: true });
    }
    fs.mkdirSync(testUserDataPath, { recursive: true });
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

    it('should update a provider', async () => {
      const provider = await MainDatabaseService.saveProvider({
        name: 'Original Name',
        type: 'openai',
        config: '{}',
        isActive: false,
      });

      await MainDatabaseService.updateProvider(provider.id, {
        name: 'Updated Name',
        isActive: true,
      });

      const updated = await MainDatabaseService.getProvider(provider.id);
      expect(updated?.name).toBe('Updated Name');
      expect(updated?.isActive).toBe(true);
    });

    it('should delete a provider', async () => {
      const provider = await MainDatabaseService.saveProvider({
        name: 'To Delete',
        type: 'openai',
        config: '{}',
        isActive: false,
      });

      await MainDatabaseService.deleteProvider(provider.id);
      const deleted = await MainDatabaseService.getProvider(provider.id);
      expect(deleted).toBeNull();
    });

    it('should get active provider', async () => {
      await MainDatabaseService.saveProvider({
        name: 'Inactive',
        type: 'openai',
        config: '{}',
        isActive: false,
      });

      const active = await MainDatabaseService.saveProvider({
        name: 'Active Provider',
        type: 'anthropic',
        config: '{}',
        isActive: true,
      });

      const retrievedActive = await MainDatabaseService.getActiveProvider();
      expect(retrievedActive?.id).toBe(active.id);
      expect(retrievedActive?.isActive).toBe(true);
    });

    it('should set active provider', async () => {
      const provider1 = await MainDatabaseService.saveProvider({
        name: 'Provider 1',
        type: 'openai',
        config: '{}',
        isActive: true,
      });

      const provider2 = await MainDatabaseService.saveProvider({
        name: 'Provider 2',
        type: 'anthropic',
        config: '{}',
        isActive: false,
      });

      await MainDatabaseService.setActiveProvider(provider2.id);

      const activeProvider = await MainDatabaseService.getActiveProvider();
      expect(activeProvider?.id).toBe(provider2.id);

      const previousActive = await MainDatabaseService.getProvider(
        provider1.id,
      );
      expect(previousActive?.isActive).toBe(false);
    });

    it('should deactivate all providers', async () => {
      await MainDatabaseService.saveProvider({
        name: 'Provider 1',
        type: 'openai',
        config: '{}',
        isActive: true,
      });

      await MainDatabaseService.saveProvider({
        name: 'Provider 2',
        type: 'anthropic',
        config: '{}',
        isActive: true,
      });

      await MainDatabaseService.deactivateAllProviders();

      const providers = await MainDatabaseService.getProviders();
      const activeCount = providers.filter((p) => p.isActive).length;
      expect(activeCount).toBe(0);
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

    it('should list conversations for a project', async () => {
      await MainDatabaseService.createConversation('Chat 1', 1);
      await MainDatabaseService.createConversation('Chat 2', 1);
      await MainDatabaseService.createConversation('Chat 3', 2);

      const conversations = await MainDatabaseService.getConversations(1);
      expect(conversations).toHaveLength(2);
      expect(conversations[0].title).toBeDefined();
    });

    it('should list all conversations without projectId filter', async () => {
      await MainDatabaseService.createConversation('Chat 1', 1);
      await MainDatabaseService.createConversation('Chat 2', 2);

      const conversations = await MainDatabaseService.getConversations();
      expect(conversations.length).toBeGreaterThanOrEqual(2);
    });

    it('should get conversation with messages', async () => {
      const conversation = await MainDatabaseService.createConversation(
        'Test Chat',
        1,
      );

      await MainDatabaseService.addMessage(conversation.id, {
        role: 'user',
        content: 'Hello',
      });

      const retrieved = await MainDatabaseService.getConversation(
        conversation.id,
      );
      expect(retrieved?.id).toBe(conversation.id);
      expect(retrieved?.title).toBe('Test Chat');
    });

    it('should update conversation', async () => {
      const conversation = await MainDatabaseService.createConversation(
        'Original Title',
        1,
      );

      await MainDatabaseService.updateConversation(conversation.id, {
        title: 'Updated Title',
      });

      const updated = await MainDatabaseService.getConversation(
        conversation.id,
      );
      expect(updated?.title).toBe('Updated Title');
    });

    it('should delete conversation and cascade delete messages', async () => {
      const conversation = await MainDatabaseService.createConversation(
        'To Delete',
        1,
      );

      await MainDatabaseService.addMessage(conversation.id, {
        role: 'user',
        content: 'Message 1',
      });

      await MainDatabaseService.deleteConversation(conversation.id);

      const deleted = await MainDatabaseService.getConversation(
        conversation.id,
      );
      expect(deleted).toBeNull();
    });
  });

  describe('Chat Message Management', () => {
    let conversationId: number;

    beforeEach(async () => {
      const conversation = await MainDatabaseService.createConversation(
        'Message Test',
        1,
      );
      conversationId = conversation.id;
    });

    it('should add message to conversation', async () => {
      const message = await MainDatabaseService.addMessage(conversationId, {
        role: 'user',
        content: 'Hello AI',
      });

      expect(message.id).toBeDefined();
      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello AI');
      expect(message.conversationId).toBe(conversationId);
    });

    it('should generate numeric IDs for provider context items', async () => {
      const message = await MainDatabaseService.addMessageWithContext(
        conversationId,
        { role: 'user', content: 'Which file is selected?' },
        [
          {
            id: 'selected-file:/project/rosetta/pipelines/test.yml',
            type: 'file',
            name: 'test.yml',
            description: 'Currently selected file',
            content: 'name: test',
            metadata: { path: '/project/rosetta/pipelines/test.yml' },
          } as any,
        ],
      );

      expect(message.contextItems).toHaveLength(1);
      expect(typeof message.contextItems[0].id).toBe('number');
    });

    it('should get messages from conversation', async () => {
      await MainDatabaseService.addMessage(conversationId, {
        role: 'user',
        content: 'Message 1',
      });

      await MainDatabaseService.addMessage(conversationId, {
        role: 'assistant',
        content: 'Response 1',
      });

      const messages = await MainDatabaseService.getMessages(conversationId);
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('user');
      expect(messages[1].role).toBe('assistant');
    });

    it('should get messages with limit and offset', async () => {
      await MainDatabaseService.addMessage(conversationId, {
        role: 'user',
        content: 'Message 1',
      });

      await MainDatabaseService.addMessage(conversationId, {
        role: 'user',
        content: 'Message 2',
      });

      await MainDatabaseService.addMessage(conversationId, {
        role: 'user',
        content: 'Message 3',
      });

      const page1 = await MainDatabaseService.getMessages(conversationId, 2, 0);
      expect(page1).toHaveLength(2);

      const page2 = await MainDatabaseService.getMessages(conversationId, 2, 2);
      expect(page2).toHaveLength(1);
    });

    it('should update message', async () => {
      const message = await MainDatabaseService.addMessage(conversationId, {
        role: 'user',
        content: 'Original',
      });

      await MainDatabaseService.updateMessage(message.id, 'Updated content');

      const messages = await MainDatabaseService.getMessages(conversationId);
      expect(messages[0].content).toBe('Updated content');
    });

    it('should delete message', async () => {
      const message = await MainDatabaseService.addMessage(conversationId, {
        role: 'user',
        content: 'To delete',
      });

      await MainDatabaseService.deleteMessage(message.id);

      const messages = await MainDatabaseService.getMessages(conversationId);
      expect(messages).toHaveLength(0);
    });
  });

  describe('Prompt Template Management', () => {
    it('should save prompt template', async () => {
      const template = await MainDatabaseService.savePromptTemplate({
        name: 'Code Review',
        category: 'development',
        providerType: 'openai',
        template: 'Review this code: {code}',
      });

      expect(template.id).toBeDefined();
      expect(template.name).toBe('Code Review');
    });

    it('should get prompt templates', async () => {
      await MainDatabaseService.savePromptTemplate({
        name: 'Template 1',
        category: 'writing',
        providerType: 'openai',
        template: 'Content 1',
      });

      await MainDatabaseService.savePromptTemplate({
        name: 'Template 2',
        category: 'writing',
        providerType: 'openai',
        template: 'Content 2',
      });

      const templates = await MainDatabaseService.getPromptTemplates();
      expect(templates.length).toBeGreaterThanOrEqual(2);
    });

    it('should get templates filtered by category', async () => {
      await MainDatabaseService.savePromptTemplate({
        name: 'Code Template',
        category: 'development',
        providerType: 'openai',
        template: 'Code',
      });

      await MainDatabaseService.savePromptTemplate({
        name: 'Writing Template',
        category: 'writing',
        providerType: 'openai',
        template: 'Writing',
      });

      const devTemplates =
        await MainDatabaseService.getPromptTemplates('development');
      expect(devTemplates.length).toBeGreaterThan(0);
      expect(devTemplates[0].category).toBe('development');
    });

    it('should update prompt template', async () => {
      const template = await MainDatabaseService.savePromptTemplate({
        name: 'Original',
        category: 'writing',
        providerType: 'openai',
        template: 'Original prompt',
      });

      await MainDatabaseService.updatePromptTemplate(template.id, {
        name: 'Updated',
        template: 'Updated prompt',
      });

      const templates = await MainDatabaseService.getPromptTemplates();
      const updated = templates.find((t) => t.id === template.id);
      expect(updated?.name).toBe('Updated');
    });

    it('should delete prompt template', async () => {
      const template = await MainDatabaseService.savePromptTemplate({
        name: 'To Delete',
        category: 'writing',
        providerType: 'openai',
        template: 'Delete me',
      });

      await MainDatabaseService.deletePromptTemplate(template.id);

      const templates = await MainDatabaseService.getPromptTemplates();
      const deleted = templates.find((t) => t.id === template.id);
      expect(deleted).toBeUndefined();
    });
  });

  describe('Usage Analytics', () => {
    let providerId: number;

    beforeEach(async () => {
      // Create a provider before logging usage (foreign key constraint)
      const provider = await MainDatabaseService.saveProvider({
        name: 'Analytics Test Provider',
        type: 'openai',
        config: '{}',
        isActive: true,
      });
      providerId = provider.id;
    });

    it('should log usage', async () => {
      await expect(
        MainDatabaseService.logUsage({
          providerId,
          operationType: 'chat',
          tokensUsed: 150,
          costEstimate: 0.003,
          durationMs: 1200,
          status: 'success',
        }),
      ).resolves.not.toThrow();
    });

    it('should get usage stats', async () => {
      await MainDatabaseService.logUsage({
        providerId,
        operationType: 'chat',
        tokensUsed: 100,
        costEstimate: 0.002,
        durationMs: 1000,
        status: 'success',
      });

      await MainDatabaseService.logUsage({
        providerId,
        operationType: 'completion',
        tokensUsed: 200,
        costEstimate: 0.004,
        durationMs: 2000,
        status: 'success',
      });

      const stats = await MainDatabaseService.getUsageStats('week');
      expect(stats).toHaveProperty('totalRequests');
      expect(stats).toHaveProperty('totalTokens');
      expect(stats).toHaveProperty('totalCost');
      expect(stats).toHaveProperty('byProvider');
      expect(stats).toHaveProperty('byOperation');
    });

    it('should filter usage stats by provider', async () => {
      await MainDatabaseService.logUsage({
        providerId,
        operationType: 'chat',
        tokensUsed: 100,
        costEstimate: 0.002,
        durationMs: 1000,
        status: 'success',
      });

      const stats = await MainDatabaseService.getUsageStats('day', providerId);
      expect(stats).toBeDefined();
    });
  });

  describe('Database Management', () => {
    it('should get database info', async () => {
      const info = await MainDatabaseService.getDatabaseInfo();
      expect(info).toHaveProperty('path');
      expect(info).toHaveProperty('size');
      expect(info).toHaveProperty('tablesCount');
    });

    it('should reset database', async () => {
      // Create some data
      await MainDatabaseService.saveProvider({
        name: 'Test',
        type: 'openai',
        config: '{}',
        isActive: true,
      });

      // Reset
      await MainDatabaseService.resetDatabase();

      // Verify database is empty
      const providers = await MainDatabaseService.getProviders();
      expect(providers).toHaveLength(0);
    });

    it('should close database connection', async () => {
      await expect(MainDatabaseService.closeDatabase()).resolves.not.toThrow();
    });
  });
});
