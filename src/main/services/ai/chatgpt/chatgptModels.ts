/**
 * Models a ChatGPT sign-in can use (Plan 71). The ChatGPT endpoint has no
 * model list, so this mirrors opencode's allow-list for ChatGPT OAuth
 * (anomalyco/opencode@b471c2b, plugin/openai/codex.ts). `gpt-5.5-pro` is
 * excluded there too.
 *
 * Context windows: opencode caps gpt-5.5 at 272k input tokens on a ChatGPT
 * sign-in. The same cap is used for every model here as a safe default.
 */
export const CHATGPT_DEFAULT_MODEL = 'gpt-5.5';

/**
 * The `provider` reported by the ChatGPT model (chatgptModel.ts). It lets
 * getContextWindow() apply the ChatGPT caps to this model only, so the same
 * model ID on an OpenAI API key keeps its own context window.
 */
export const CHATGPT_PROVIDER_ID = 'chatgpt';

export const CHATGPT_INPUT_TOKEN_LIMIT = 272_000;

export const CHATGPT_MODELS = [
  { id: 'gpt-5.5', name: 'GPT-5.5' },
  { id: 'gpt-5.4', name: 'GPT-5.4' },
  { id: 'gpt-5.4-mini', name: 'GPT-5.4 mini' },
  { id: 'gpt-5.3-codex-spark', name: 'GPT-5.3 Codex Spark' },
  { id: 'gpt-6-sol', name: 'GPT-6 Sol' },
  { id: 'gpt-6-luna', name: 'GPT-6 Luna' },
].map((model) => ({
  ...model,
  supportsStreaming: true,
  contextWindow: CHATGPT_INPUT_TOKEN_LIMIT,
}));

export const CHATGPT_CONTEXT_WINDOWS: Record<string, number> =
  Object.fromEntries(
    CHATGPT_MODELS.map((model) => [model.id, model.contextWindow]),
  );
