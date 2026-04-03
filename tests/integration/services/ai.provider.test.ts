/**
 * AI Provider Integration Tests (AI SDK v6)
 *
 * These tests do NOT require a database connection — testTemporaryProvider
 * builds the AI SDK model directly from credentials without touching the DB.
 *
 * jest.mock() calls MUST be before all imports — Jest hoists them.
 */

// Mock electron BEFORE imports
import { AIProviderManager } from '../../../src/main/services/ai/providerManager.service';

jest.mock('electron', () => {
  // eslint-disable-next-line global-require
  const osModule = require('os');
  // eslint-disable-next-line global-require
  const pathModule = require('path');
  return {
    app: {
      getPath: jest.fn().mockImplementation((name: string) => {
        if (name === 'userData')
          return pathModule.join(osModule.tmpdir(), 'dbt-studio-ai-test');
        return '';
      }),
    },
  };
});

// Mock AI SDK v6
jest.mock('ai', () => ({
  generateText: jest
    .fn()
    .mockResolvedValue({ text: 'test successful', usage: { totalTokens: 10 } }),
}));

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: jest.fn(() => jest.fn(() => 'mock-openai-model')),
}));
jest.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: jest.fn(() => jest.fn(() => 'mock-anthropic-model')),
}));
jest.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: jest.fn(() => jest.fn(() => 'mock-gemini-model')),
}));
jest.mock('ollama-ai-provider', () => ({
  createOllama: jest.fn(() => jest.fn(() => 'mock-ollama-model')),
}));

jest.mock('../../../src/main/services/secureStorage.service', () => ({
  default: {
    getAIProviderCredential: jest.fn().mockResolvedValue('test-api-key'),
    setAIProviderCredential: jest.fn().mockResolvedValue(undefined),
    deleteAIProviderCredential: jest.fn().mockResolvedValue(undefined),
  },
  AIProviderType: {},
}));

describe('AI Provider — testTemporaryProvider (no DB required)', () => {
  it('tests openai successfully', async () => {
    const { generateText } = await import('ai');

    const result = await AIProviderManager.testTemporaryProvider(
      {
        name: 'Temp OpenAI',
        type: 'openai',
        config: JSON.stringify({}),
        isActive: false,
      },
      { apiKey: 'test-key-123' },
    );

    expect(result.success).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(generateText).toHaveBeenCalled();
  });

  it('tests gemini successfully with dynamic model fetch', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        models: [
          {
            name: 'models/gemini-2.5-flash',
            displayName: 'Gemini 2.5 Flash',
            supportedGenerationMethods: ['generateContent'],
          },
        ],
      }),
    }) as jest.Mock;

    const result = await AIProviderManager.testTemporaryProvider(
      {
        name: 'Temp Gemini',
        type: 'gemini',
        config: JSON.stringify({}),
        isActive: false,
      },
      { apiKey: 'test-gemini-key' },
    );

    expect(result.success).toBe(true);
  });

  it('tests anthropic successfully', async () => {
    const result = await AIProviderManager.testTemporaryProvider(
      {
        name: 'Temp Anthropic',
        type: 'anthropic',
        config: JSON.stringify({}),
        isActive: false,
      },
      { apiKey: 'test-anthropic-key' },
    );

    expect(result.success).toBe(true);
  });

  it('returns failure when no api key provided', async () => {
    const result = await AIProviderManager.testTemporaryProvider(
      {
        name: 'No Key',
        type: 'openai',
        config: JSON.stringify({}),
        isActive: false,
      },
      {},
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('No API key');
  });

  it('returns failure for unsupported provider type', async () => {
    const result = await AIProviderManager.testTemporaryProvider(
      {
        name: 'Unknown',
        type: 'unknown' as any,
        config: JSON.stringify({}),
        isActive: false,
      },
      { apiKey: 'some-key' },
    );

    expect(result.success).toBe(false);
  });
});
