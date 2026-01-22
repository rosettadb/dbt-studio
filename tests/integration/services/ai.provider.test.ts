import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { AIProviderManager } from '../../../src/main/services/ai/providerManager.service';
import MainDatabaseService from '../../../src/main/services/mainDatabase.service';

// Define path constants
const TEST_DIR_NAME = 'dbt-studio-ai-provider-test';
const TEST_DIR = path.join(os.tmpdir(), TEST_DIR_NAME);
const MOCK_USER_DATA = path.join(TEST_DIR, 'userData');

// Mock electron app
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => path.join(os.tmpdir(), 'dbt-studio-ai-provider-test', 'userData')),
    getName: jest.fn().mockReturnValue('Rosetta DBT Studio Test'),
    getVersion: jest.fn().mockReturnValue('1.0.0'),
  },
}));

// Mock AI provider implementations to avoid real API calls
jest.mock('../../../src/main/services/ai/providers/openai.provider', () => ({
  OpenAIProvider: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    testConnection: jest.fn().mockResolvedValue({
      success: true,
      message: 'Connection successful',
      latencyMs: 100,
    }),
    getAvailableModels: jest.fn().mockResolvedValue([
      { id: 'gpt-4', name: 'GPT-4' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
    ]),
    complete: jest.fn().mockResolvedValue({
      content: 'Test response',
      model: 'gpt-4',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    }),
  })),
}));

jest.mock('../../../src/main/services/ai/providers/anthropic.provider', () => ({
  AnthropicProvider: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    testConnection: jest.fn().mockResolvedValue({
      success: true,
      message: 'Connection successful',
      latencyMs: 120,
    }),
    getAvailableModels: jest.fn().mockResolvedValue([
      { id: 'claude-3-opus', name: 'Claude 3 Opus' },
      { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet' },
    ]),
    complete: jest.fn().mockResolvedValue({
      content: 'Test response from Claude',
      model: 'claude-3-opus',
      usage: { promptTokens: 15, completionTokens: 25, totalTokens: 40 },
    }),
  })),
}));

jest.mock('../../../src/main/services/ai/providers/gemini.provider', () => ({
  GeminiProvider: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    testConnection: jest.fn().mockResolvedValue({
      success: true,
      message: 'Connection successful',
      latencyMs: 110,
    }),
    getAvailableModels: jest.fn().mockResolvedValue([
      { id: 'gemini-pro', name: 'Gemini Pro' },
    ]),
    complete: jest.fn().mockResolvedValue({
      content: 'Test response from Gemini',
      model: 'gemini-pro',
      usage: { promptTokens: 12, completionTokens: 18, totalTokens: 30 },
    }),
  })),
}));

jest.mock('../../../src/main/services/ai/providers/ollama.provider', () => ({
  OllamaProvider: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    testConnection: jest.fn().mockResolvedValue({
      success: true,
      message: 'Connection successful',
      latencyMs: 50,
    }),
    getAvailableModels: jest.fn().mockResolvedValue([
      { id: 'llama2', name: 'Llama 2' },
      { id: 'mistral', name: 'Mistral' },
    ]),
    complete: jest.fn().mockResolvedValue({
      content: 'Test response from Ollama',
      model: 'llama2',
      usage: { promptTokens: 10, completionTokens: 15, totalTokens: 25 },
    }),
  })),
}));

// Mock secure storage
jest.mock('../../../src/main/services/secureStorage.service', () => ({
  __esModule: true,
  default: {
    setAIProviderCredential: jest.fn().mockResolvedValue(undefined),
    getAIProviderCredential: jest.fn().mockResolvedValue('mock-api-key'),
    deleteAIProviderCredential: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('AI Provider Integration', () => {
  beforeAll(async () => {
    // Clean up any existing test directory
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }

    // Create test directory structure
    if (!fs.existsSync(MOCK_USER_DATA)) {
      fs.mkdirSync(MOCK_USER_DATA, { recursive: true });
    }

    // Initialize the database
    await MainDatabaseService.initializeDatabase();
  });

  afterAll(() => {
    // Close database connection
    const Service = MainDatabaseService as any;
    if (Service.sqlite) {
      Service.sqlite.close();
      Service.sqlite = null;
      Service.db = null;
    }

    // Cleanup
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    // Clear all providers before each test
    const providers = await MainDatabaseService.getProviders();
    await Promise.all(
      providers.map((p: any) => MainDatabaseService.deleteProvider(p.id!)),
    );
  });

  describe('Provider Management', () => {
    describe('createProvider', () => {
      it('should create an OpenAI provider', async () => {
        const provider = await AIProviderManager.createProvider({
          name: 'Test OpenAI',
          type: 'openai',
          config: JSON.stringify({
            apiKey: 'test-key',
            model: 'gpt-4',
          }),
          isActive: false,
        });

        expect(provider).toBeDefined();
        expect(provider.name).toBe('Test OpenAI');
        expect(provider.type).toBe('openai');
        expect(provider.id).toBeDefined();
      });

      it('should create an Anthropic provider', async () => {
        const provider = await AIProviderManager.createProvider({
          name: 'Test Anthropic',
          type: 'anthropic',
          config: JSON.stringify({
            apiKey: 'test-key',
            model: 'claude-3-opus',
          }),
          isActive: false,
        });

        expect(provider).toBeDefined();
        expect(provider.name).toBe('Test Anthropic');
        expect(provider.type).toBe('anthropic');
      });

      it('should create a Gemini provider', async () => {
        const provider = await AIProviderManager.createProvider({
          name: 'Test Gemini',
          type: 'gemini',
          config: JSON.stringify({
            apiKey: 'test-key',
            model: 'gemini-pro',
          }),
          isActive: false,
        });

        expect(provider).toBeDefined();
        expect(provider.name).toBe('Test Gemini');
        expect(provider.type).toBe('gemini');
      });

      it('should create an Ollama provider', async () => {
        const provider = await AIProviderManager.createProvider({
          name: 'Test Ollama',
          type: 'ollama',
          config: JSON.stringify({
            baseUrl: 'http://localhost:11434',
            model: 'llama2',
          }),
          isActive: false,
        });

        expect(provider).toBeDefined();
        expect(provider.name).toBe('Test Ollama');
        expect(provider.type).toBe('ollama');
      });

      it('should store API key separately from config', async () => {
        const provider = await AIProviderManager.createProvider({
          name: 'Test Provider',
          type: 'openai',
          config: JSON.stringify({
            apiKey: 'secret-key',
            model: 'gpt-4',
          }),
          isActive: false,
        });

        // Config should not contain API key
        const config = JSON.parse(provider.config as string);
        expect(config.apiKey).toBeUndefined();
        expect(config.model).toBe('gpt-4');
      });
    });

    describe('updateProvider', () => {
      it('should update provider name', async () => {
        const provider = await AIProviderManager.createProvider({
          name: 'Original Name',
          type: 'openai',
          config: JSON.stringify({ model: 'gpt-4' }),
          isActive: false,
        });

        const updated = await AIProviderManager.updateProvider(provider.id!, {
          name: 'Updated Name',
        });

        expect(updated.name).toBe('Updated Name');
        expect(updated.type).toBe('openai');
      });

      it('should update provider config', async () => {
        const provider = await AIProviderManager.createProvider({
          name: 'Test Provider',
          type: 'openai',
          config: JSON.stringify({ model: 'gpt-4' }),
          isActive: false,
        });

        const updated = await AIProviderManager.updateProvider(provider.id!, {
          type: 'openai',
          config: JSON.stringify({ model: 'gpt-3.5-turbo' }),
        });

        const config = JSON.parse(updated.config as string);
        expect(config.model).toBe('gpt-3.5-turbo');
      });

      it('should handle API key updates', async () => {
        const provider = await AIProviderManager.createProvider({
          name: 'Test Provider',
          type: 'openai',
          config: JSON.stringify({ apiKey: 'old-key', model: 'gpt-4' }),
          isActive: false,
        });

        await AIProviderManager.updateProvider(provider.id!, {
          type: 'openai',
          config: JSON.stringify({ apiKey: 'new-key', model: 'gpt-4' }),
        });

        // API key should be stored separately
        const updated = await MainDatabaseService.getProvider(provider.id!);
        const config = JSON.parse(updated!.config as string);
        expect(config.apiKey).toBeUndefined();
      });
    });

    describe('deleteProvider', () => {
      it('should delete a provider', async () => {
        const provider = await AIProviderManager.createProvider({
          name: 'To Delete',
          type: 'openai',
          config: JSON.stringify({ model: 'gpt-4' }),
          isActive: false,
        });

        await AIProviderManager.deleteProvider(provider.id!);

        const deleted = await MainDatabaseService.getProvider(provider.id!);
        expect(deleted).toBeNull();
      });

      it('should delete provider credentials', async () => {
        const provider = await AIProviderManager.createProvider({
          name: 'To Delete',
          type: 'openai',
          config: JSON.stringify({ apiKey: 'test-key', model: 'gpt-4' }),
          isActive: false,
        });

        await AIProviderManager.deleteProvider(provider.id!);

        // Verify deletion was attempted (mocked)
        const SecureStorageService = require('../../../src/main/services/secureStorage.service')
          .default;
        expect(
          SecureStorageService.deleteAIProviderCredential,
        ).toHaveBeenCalled();
      });
    });

    describe('setActiveProvider', () => {
      it('should set a provider as active', async () => {
        const provider = await AIProviderManager.createProvider({
          name: 'Test Provider',
          type: 'openai',
          config: JSON.stringify({ model: 'gpt-4' }),
          isActive: false,
        });

        await AIProviderManager.setActiveProvider(provider.id!.toString());

        const activeProvider = await MainDatabaseService.getActiveProvider();
        expect(activeProvider).toBeDefined();
        expect(activeProvider!.id).toBe(provider.id);
      });
    });
  });

  describe('Provider Testing', () => {
    describe('testTemporaryProvider', () => {
      it('should test OpenAI provider connection', async () => {
        const result = await AIProviderManager.testTemporaryProvider(
          {
            name: 'Test OpenAI',
            type: 'openai',
            config: JSON.stringify({ model: 'gpt-4' }),
            isActive: false,
          },
          { apiKey: 'test-key' },
        );

        expect(result.success).toBe(true);
        expect(result.message).toBe('Connection successful');
        expect(result.latencyMs).toBeDefined();
        expect(result.models).toBeDefined();
        expect(result.modelsAvailable).toBeGreaterThan(0);
      });

      it('should test Anthropic provider connection', async () => {
        const result = await AIProviderManager.testTemporaryProvider(
          {
            name: 'Test Anthropic',
            type: 'anthropic',
            config: JSON.stringify({ model: 'claude-3-opus' }),
            isActive: false,
          },
          { apiKey: 'test-key' },
        );

        expect(result.success).toBe(true);
        expect(result.models).toHaveLength(2);
      });

      it('should test Gemini provider connection', async () => {
        const result = await AIProviderManager.testTemporaryProvider(
          {
            name: 'Test Gemini',
            type: 'gemini',
            config: JSON.stringify({ model: 'gemini-pro' }),
            isActive: false,
          },
          { apiKey: 'test-key' },
        );

        expect(result.success).toBe(true);
        expect(result.models).toBeDefined();
      });

      it('should test Ollama provider connection', async () => {
        const result = await AIProviderManager.testTemporaryProvider(
          {
            name: 'Test Ollama',
            type: 'ollama',
            config: JSON.stringify({
              baseUrl: 'http://localhost:11434',
              model: 'llama2',
            }),
            isActive: false,
          },
          {},
        );

        expect(result.success).toBe(true);
        expect(result.models).toHaveLength(2);
      });

      it('should handle unsupported provider type', async () => {
        const result = await AIProviderManager.testTemporaryProvider(
          {
            name: 'Unknown Provider',
            type: 'unknown' as any,
            config: JSON.stringify({}),
            isActive: false,
          },
          {},
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('Unsupported provider type');
      });
    });

    describe('getProviderModels', () => {
      it('should get models for OpenAI provider', async () => {
        const provider = await AIProviderManager.createProvider({
          name: 'Test OpenAI',
          type: 'openai',
          config: JSON.stringify({ apiKey: 'test-key', model: 'gpt-4' }),
          isActive: false,
        });

        const models = await AIProviderManager.getProviderModels(
          provider.id!.toString(),
        );

        expect(models).toHaveLength(2);
        expect(models[0].id).toBe('gpt-4');
        expect(models[1].id).toBe('gpt-3.5-turbo');
      });

      it('should get models for Anthropic provider', async () => {
        const provider = await AIProviderManager.createProvider({
          name: 'Test Anthropic',
          type: 'anthropic',
          config: JSON.stringify({
            apiKey: 'test-key',
            model: 'claude-3-opus',
          }),
          isActive: false,
        });

        const models = await AIProviderManager.getProviderModels(
          provider.id!.toString(),
        );

        expect(models).toHaveLength(2);
        expect(models[0].id).toBe('claude-3-opus');
      });

      it('should return empty array for non-existent provider', async () => {
        const models = await AIProviderManager.getProviderModels('99999');

        expect(models).toHaveLength(0);
      });
    });
  });

  describe('Active Provider Operations', () => {
    it('should get initialized active provider and model', async () => {
      // Create and activate a provider
      const provider = await AIProviderManager.createProvider({
        name: 'Active Provider',
        type: 'openai',
        config: JSON.stringify({ apiKey: 'test-key', model: 'gpt-4' }),
        isActive: false,
      });

      await AIProviderManager.setActiveProvider(provider.id!.toString());

      const result =
        await AIProviderManager.getInitializedActiveProviderAndModel();

      expect(result).toBeDefined();
      expect(result.providerInstance).toBeDefined();
      expect(result.selectedModel).toBeDefined();
      expect(result.providerType).toBe('openai');
    });

    it('should throw error when no active provider', async () => {
      await expect(
        AIProviderManager.getInitializedActiveProviderAndModel(),
      ).rejects.toThrow('No active AI provider configured');
    });

    it('should use requested model if provided', async () => {
      const provider = await AIProviderManager.createProvider({
        name: 'Active Provider',
        type: 'openai',
        config: JSON.stringify({ apiKey: 'test-key', model: 'gpt-4' }),
        isActive: false,
      });

      await AIProviderManager.setActiveProvider(provider.id!.toString());

      const result =
        await AIProviderManager.getInitializedActiveProviderAndModel(
          'gpt-3.5-turbo',
        );

      expect(result.selectedModel).toBe('gpt-3.5-turbo');
    });
  });
});
