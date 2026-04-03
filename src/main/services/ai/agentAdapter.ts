// Agent Adapter - Credential Bridge for Vercel AI SDK v6
// This file bridges SecureStorageService (existing credential store) with Vercel AI SDK v6.
// Nothing else in the credential system changes.

import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOllama } from 'ollama-ai-provider';
import MainDatabaseService from '../mainDatabase.service';
import SecureStorageService, { AIProviderType } from '../secureStorage.service';

function getDefaultModel(providerType: string): string {
  const defaults: Record<string, string> = {
    openai: 'gpt-4.1',
    anthropic: 'claude-sonnet-4-6',
    gemini: 'gemini-1.5-pro',
    ollama: 'llama3.2',
  };
  return defaults[providerType] || 'gpt-4.1';
}

/**
 * Reads the active provider from existing DB + keychain and returns
 * a Vercel AI SDK v6 LanguageModel instance.
 *
 * All credential management stays in SecureStorageService — unchanged.
 */
export async function getVercelModel(requestedModel?: string) {
  const activeProvider = await MainDatabaseService.getActiveProvider();
  if (!activeProvider) {
    throw new Error(
      'No active AI provider configured. Please configure a provider in Settings.',
    );
  }

  const config: any =
    typeof activeProvider.config === 'string'
      ? JSON.parse(activeProvider.config)
      : activeProvider.config || {};

  const model =
    requestedModel || config.model || getDefaultModel(activeProvider.type);

  // Ollama: no API key needed — use official community provider
  if (activeProvider.type === 'ollama') {
    const ollama = createOllama({
      baseURL: config.baseUrl || 'http://localhost:11434/api',
    });
    return ollama(model);
  }

  // Cloud providers: read API key from SecureStorageService (keychain)
  const apiKey = await SecureStorageService.getAIProviderCredential(
    activeProvider.id!,
    activeProvider.type as AIProviderType,
  );

  if (!apiKey) {
    throw new Error(
      `No API key configured for ${activeProvider.type}. Please add credentials in Settings.`,
    );
  }

  switch (activeProvider.type) {
    case 'openai':
      return createOpenAI({ apiKey })(model);
    case 'anthropic':
      return createAnthropic({ apiKey })(model);
    case 'gemini':
      return createGoogleGenerativeAI({ apiKey })(model);
    default:
      throw new Error(`Unsupported provider type: ${activeProvider.type}`);
  }
}
