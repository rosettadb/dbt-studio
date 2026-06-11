// Agent Adapter - Credential Bridge for Vercel AI SDK v6
// This file bridges SecureStorageService (existing credential store) with Vercel AI SDK v6.
// Nothing else in the credential system changes.

import { wrapLanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOllama } from 'ai-sdk-ollama';
import MainDatabaseService from '../mainDatabase.service';
import SecureStorageService, { AIProviderType } from '../secureStorage.service';
import {
  buildOllamaHeaders,
  buildOllamaTagsUrl,
  isHostedOllamaCloudUrl,
  isRemoteOllamaUrl,
  normalizeOllamaBaseUrl,
  shouldAttachOllamaAuth,
} from './utils/ollamaProvider.utils';

async function maybeWrapWithDevtools<TModel>(model: TModel): Promise<TModel> {
  if (process.env.NODE_ENV === 'production') {
    return model;
  }

  try {
    const { devToolsMiddleware } = await import('@ai-sdk/devtools');
    return wrapLanguageModel({
      model: model as any,
      middleware: devToolsMiddleware(),
    }) as TModel;
  } catch {
    return model;
  }
}

/**
 * Gets the default model for a provider by fetching from API.
 * Returns the first available model from the provider's API.
 */
async function getDefaultModelDynamic(
  providerType: string,
  apiKey?: string,
  baseUrl?: string,
): Promise<string> {
  // eslint-disable-next-line no-console
  console.log(
    '[agentAdapter] Getting default model dynamically for:',
    providerType,
  );

  try {
    switch (providerType) {
      case 'openai': {
        if (!apiKey) throw new Error('API key required for OpenAI');
        const response = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!response.ok) throw new Error('Failed to fetch OpenAI models');
        const data = await response.json();
        const gptModels = data.data
          .filter(
            (m: any) =>
              m.id.startsWith('gpt-') ||
              m.id.startsWith('o1-') ||
              m.id.startsWith('o3-'),
          )
          .sort((a: any, b: any) => b.id.localeCompare(a.id));
        if (gptModels.length > 0) {
          // eslint-disable-next-line no-console
          console.log(
            '[agentAdapter] Using first OpenAI model:',
            gptModels[0].id,
          );
          return gptModels[0].id;
        }
        break;
      }

      case 'gemini': {
        if (!apiKey) throw new Error('API key required for Gemini');
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        );
        if (!response.ok) throw new Error('Failed to fetch Gemini models');
        const data = await response.json();
        const geminiModels = data.models
          .filter(
            (m: any) =>
              m.supportedGenerationMethods?.includes('generateContent') &&
              m.name.includes('gemini'),
          )
          .sort((a: any, b: any) => b.name.localeCompare(a.name));
        if (geminiModels.length > 0) {
          const modelId = geminiModels[0].name.split('/').pop();
          // eslint-disable-next-line no-console
          console.log('[agentAdapter] Using first Gemini model:', modelId);
          return modelId;
        }
        break;
      }

      case 'anthropic': {
        // Anthropic doesn't have a public models API
        // Use the latest known model
        const latestModel = 'claude-sonnet-4-6';
        // eslint-disable-next-line no-console
        console.log(
          '[agentAdapter] Using latest Anthropic model:',
          latestModel,
        );
        return latestModel;
      }

      case 'ollama': {
        const response = await fetch(buildOllamaTagsUrl(baseUrl), {
          headers: shouldAttachOllamaAuth(baseUrl, apiKey)
            ? buildOllamaHeaders(apiKey)
            : undefined,
        });
        if (!response.ok) throw new Error('Failed to fetch Ollama models');
        const data = await response.json();
        if (data.models && data.models.length > 0) {
          // eslint-disable-next-line no-console
          console.log(
            '[agentAdapter] Using first Ollama model:',
            data.models[0].name,
          );
          return data.models[0].name;
        }
        break;
      }

      default:
        throw new Error(`Unknown provider type: ${providerType}`);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      '[agentAdapter] Failed to fetch default model dynamically:',
      error,
    );
  }

  // Absolute fallback only if API fails
  const fallbacks: Record<string, string> = {
    openai: 'gpt-4o',
    anthropic: 'claude-sonnet-4-6',
    gemini: 'gemini-2.5-flash',
    ollama: 'llama3.2',
  };
  const fallback = fallbacks[providerType] || 'gpt-4o';
  // eslint-disable-next-line no-console
  console.warn('[agentAdapter] Using fallback model:', fallback);
  return fallback;
}

/**
 * Reads the active provider from existing DB + keychain and returns
 * a Vercel AI SDK v6 LanguageModel instance.
 *
 * All credential management stays in SecureStorageService — unchanged.
 */
export async function getVercelModel(requestedModel?: string) {
  // eslint-disable-next-line no-console
  console.log(
    '[agentAdapter] getVercelModel called with requestedModel:',
    requestedModel,
  );

  const activeProvider = await MainDatabaseService.getActiveProvider();
  if (!activeProvider) {
    throw new Error(
      'No active AI provider configured. Please configure a provider in Settings.',
    );
  }

  // eslint-disable-next-line no-console
  console.log('[agentAdapter] Active provider loaded:', {
    id: activeProvider.id,
    name: activeProvider.name,
    type: activeProvider.type,
    configType: typeof activeProvider.config,
  });

  const config: any =
    typeof activeProvider.config === 'string'
      ? JSON.parse(activeProvider.config)
      : activeProvider.config || {};

  // eslint-disable-next-line no-console
  console.log('[agentAdapter] Parsed config:', {
    hasModel: !!config.model,
    model: config.model,
    hasBaseUrl: !!config.baseUrl,
  });

  // Get API key first (needed for dynamic model fetching)
  let apiKey: string | null | undefined;
  if (activeProvider.type !== 'ollama' || isRemoteOllamaUrl(config.baseUrl)) {
    apiKey = await SecureStorageService.getAIProviderCredential(
      activeProvider.id!,
      activeProvider.type as AIProviderType,
    );
  }

  // Determine model: requested > configured > dynamic from API
  let model: string;
  if (requestedModel) {
    model = requestedModel;
    // eslint-disable-next-line no-console
    console.log('[agentAdapter] Using requested model:', model);
  } else if (config.model) {
    model = config.model;
    // eslint-disable-next-line no-console
    console.log('[agentAdapter] Using configured model:', model);
  } else {
    // No model configured - fetch dynamically from API
    // eslint-disable-next-line no-console
    console.log('[agentAdapter] No model configured, fetching dynamically...');
    model = await getDefaultModelDynamic(
      activeProvider.type,
      apiKey || undefined,
      config.baseUrl,
    );
  }

  // eslint-disable-next-line no-console
  console.log('[agentAdapter] Final model to use:', model);

  // Ollama: local requires no key; remote self-hosted may optionally use bearer auth.
  if (activeProvider.type === 'ollama') {
    const baseURL = normalizeOllamaBaseUrl(config.baseUrl);

    if (isHostedOllamaCloudUrl(baseURL) && !apiKey) {
      throw new Error(
        'No API key configured for hosted Ollama. Please add credentials in Settings.',
      );
    }

    const ollama = createOllama({
      baseURL,
      ...(shouldAttachOllamaAuth(baseURL, apiKey)
        ? { headers: buildOllamaHeaders(apiKey) }
        : {}),
    });
    return maybeWrapWithDevtools(ollama(model));
  }

  // Cloud providers: API key required
  if (!apiKey) {
    throw new Error(
      `No API key configured for ${activeProvider.type}. Please add credentials in Settings.`,
    );
  }

  // eslint-disable-next-line no-console
  console.log(
    '[agentAdapter] Creating provider instance for:',
    activeProvider.type,
  );

  switch (activeProvider.type) {
    case 'openai':
      // Use 'compatible' mode to force Chat Completions API for all models.
      // The default 'strict' mode uses the new Responses API for newer models
      // (e.g. gpt-5.x) which can hang indefinitely on the initial connection.
      return maybeWrapWithDevtools(
        createOpenAI({ apiKey, compatibility: 'compatible' } as any)(model),
      );
    case 'anthropic':
      return maybeWrapWithDevtools(createAnthropic({ apiKey })(model));
    case 'gemini':
      // eslint-disable-next-line no-console
      console.log('[agentAdapter] Creating Gemini provider with model:', model);
      return maybeWrapWithDevtools(createGoogleGenerativeAI({ apiKey })(model));
    default:
      throw new Error(`Unsupported provider type: ${activeProvider.type}`);
  }
}
