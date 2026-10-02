/**
 * Builds the AI SDK model for a ChatGPT sign-in (Plan 71).
 *
 * `store: false` must be known to the SDK, not only sent on the wire: with
 * the default `store: true`, `@ai-sdk/openai` sends earlier reasoning and
 * tool items as `item_reference` IDs, which the ChatGPT endpoint can't
 * resolve because it stores nothing (Plan 71, H7). `strictJsonSchema: false`
 * keeps our structured-output schemas with optional fields working on the
 * Responses API (Plan 71, C1). The middleware applies both to every call,
 * so no call site changes.
 */
import { createOpenAI } from '@ai-sdk/openai';
import { defaultSettingsMiddleware, wrapLanguageModel } from 'ai';
import { CHATGPT_BASE_URL } from './chatgptOAuth';
import { createChatGptFetch, ChatGptCredentialSource } from './chatgptFetch';

export function createChatGptModel(
  getCredential: ChatGptCredentialSource,
  modelId: string,
  baseFetch?: typeof fetch,
) {
  const provider = createOpenAI({
    baseURL: CHATGPT_BASE_URL,
    // Placeholder; chatgptFetch replaces the header with the OAuth token.
    apiKey: 'chatgpt-oauth',
    fetch: createChatGptFetch(getCredential, baseFetch),
  });

  return wrapLanguageModel({
    model: provider.responses(modelId),
    middleware: defaultSettingsMiddleware({
      settings: {
        providerOptions: {
          openai: { store: false, strictJsonSchema: false },
        },
      },
    }),
  });
}
