// Agent Adapter - Credential Bridge for Vercel AI SDK v6
// This file bridges SecureStorageService (existing credential store) with Vercel AI SDK v6.
// Nothing else in the credential system changes.

import { wrapLanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOllama } from 'ai-sdk-ollama';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
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

const LMSTUDIO_DEFAULT_BASE_URL = 'http://localhost:1234/v1';

function resolveOpenAICompatibleBaseUrl(
  providerType: string,
  configBaseUrl?: string,
): string {
  if (configBaseUrl && configBaseUrl.trim().length > 0) {
    return configBaseUrl.trim();
  }
  if (providerType === 'lmstudio') {
    return LMSTUDIO_DEFAULT_BASE_URL;
  }
  throw new Error(
    `No base URL configured for ${providerType} provider. Please set a Base URL in Settings.`,
  );
}

function createOpenAICompatibleModel(
  providerType: string,
  baseURL: string,
  modelId: string,
  apiKey?: string | null,
  includeUsage?: boolean,
) {
  const provider = createOpenAICompatible({
    name: providerType,
    baseURL,
    ...(apiKey ? { apiKey } : {}),
    includeUsage: includeUsage ?? true,
  });
  return provider(modelId);
}

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

          return modelId;
        }
        break;
      }

      case 'anthropic': {
        // Anthropic doesn't have a public models API
        // Use the latest known model
        const latestModel = 'claude-sonnet-4-6';

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
          return data.models[0].name;
        }
        break;
      }

      case 'lmstudio':
      case 'openai-compatible': {
        const resolvedBaseUrl = resolveOpenAICompatibleBaseUrl(
          providerType,
          baseUrl,
        );
        const modelsUrl = `${resolvedBaseUrl.replace(/\/+$/, '')}/models`;
        const headers: Record<string, string> = {};
        if (apiKey) {
          headers.Authorization = `Bearer ${apiKey}`;
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        try {
          const response = await fetch(modelsUrl, {
            headers,
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (!response.ok)
            throw new Error(`Failed to fetch models from ${modelsUrl}`);
          const data = await response.json();
          const models: any[] = data.data || data.models || [];
          if (models.length > 0) {
            const firstId = models[0].id ?? models[0].name;

            if (typeof firstId !== 'string' || firstId.trim() === '') {
              throw new Error(
                `Invalid model identifier received from ${modelsUrl}`,
              );
            }

            return firstId;
          }
          throw new Error(`No models found at ${modelsUrl}`);
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
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
    lmstudio: 'llama-3.2-1b',
  };
  const fallback = fallbacks[providerType];

  if (fallback) return fallback;

  throw new Error(
    `Failed to discover models for ${providerType}. Please specify a model explicitly.`,
  );
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

  // Get API key first (needed for dynamic model fetching)
  let apiKey: string | null | undefined;
  const isLocalLmStudio =
    activeProvider.type === 'lmstudio' &&
    (!config.baseUrl ||
      config.baseUrl.includes('localhost') ||
      config.baseUrl.includes('127.0.0.1'));

  if (
    (activeProvider.type !== 'ollama' && !isLocalLmStudio) ||
    (activeProvider.type === 'ollama' && isRemoteOllamaUrl(config.baseUrl))
  ) {
    apiKey = await SecureStorageService.getAIProviderCredential(
      activeProvider.id!,
      activeProvider.type as AIProviderType,
    );
  }

  // For local LM Studio, also attempt to load key but don't require it
  if (isLocalLmStudio) {
    apiKey = await SecureStorageService.getAIProviderCredential(
      activeProvider.id!,
      activeProvider.type as AIProviderType,
    );
  }

  // Determine model: requested > configured > dynamic from API
  let model: string;
  if (requestedModel) {
    model = requestedModel;
  } else if (config.model) {
    model = config.model;
  } else {
    model = await getDefaultModelDynamic(
      activeProvider.type,
      apiKey || undefined,
      config.baseUrl,
    );
  }

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
  if (
    !apiKey &&
    activeProvider.type !== 'openai-compatible' &&
    activeProvider.type !== 'lmstudio'
  ) {
    throw new Error(
      `No API key configured for ${activeProvider.type}. Please add credentials in Settings.`,
    );
  }

  switch (activeProvider.type) {
    case 'openai':
      // Use 'compatible' mode to force Chat Completions API for all models.
      // The default 'strict' mode uses the new Responses API for newer models
      // (e.g. gpt-5.x) which can hang indefinitely on the initial connection.
      return maybeWrapWithDevtools(
        createOpenAI({ apiKey, compatibility: 'compatible' } as any)(model),
      );
    case 'anthropic':
      return maybeWrapWithDevtools(
        createAnthropic({ apiKey: apiKey as string })(model),
      );
    case 'gemini':
      return maybeWrapWithDevtools(
        createGoogleGenerativeAI({ apiKey: apiKey as string })(model),
      );
    case 'openai-compatible':
    case 'lmstudio': {
      const baseURL = resolveOpenAICompatibleBaseUrl(
        activeProvider.type,
        config.baseUrl,
      );

      const sdkModel = createOpenAICompatibleModel(
        activeProvider.type,
        baseURL,
        model,
        apiKey,
        config.includeUsage,
      );
      return maybeWrapWithDevtools(sdkModel);
    }
    default:
      throw new Error(`Unsupported provider type: ${activeProvider.type}`);
  }
}
