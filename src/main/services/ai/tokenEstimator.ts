/* eslint-disable no-console */
/**
 * Token Estimator Service
 * Provides fast approximate token counts and context window sizes per model.
 * Rule of thumb: 1 token ≈ 3.5 chars for English code/text (used by major LLM providers).
 * We use 3 chars/token to slightly over-estimate, which is safer for context management.
 *
 * Context window resolution order:
 *   1. Live cache populated by fetchAndCacheContextWindows() (called by providerManager on save)
 *   2. Static fallback table below (covers known models at build time)
 *   3. 'default' entry (32K) if nothing matches
 */

// ─── Static Fallback Table ────────────────────────────────────────────────────
// Last updated: April 2026. Used when the provider API is unreachable.
const CONTEXT_WINDOWS_FALLBACK: Record<string, number> = {
  // OpenAI — GPT-5 family (released 2026)
  // Total context 400K (272K input + 128K output); 5.4 supports 1M experimentally
  'gpt-5.4': 1_000_000,
  'gpt-5.4-pro': 400_000,
  'gpt-5.3': 400_000,
  'gpt-5.2': 400_000,
  'gpt-5.2-pro': 400_000,
  'gpt-5': 400_000,
  // OpenAI — GPT-4.1 family (1M context, released 2026)
  'gpt-4.1': 1_000_000,
  'gpt-4.1-mini': 128_000,
  'gpt-4.1-nano': 128_000,
  // OpenAI — GPT-4o family
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  // OpenAI — o-series reasoning models
  'o4-mini': 200_000,
  'o3-mini': 200_000,
  o3: 200_000,
  o1: 200_000,
  // OpenAI — legacy
  'gpt-4-turbo': 128_000,
  'gpt-3.5-turbo': 16_000,

  // Anthropic — Claude 4.6 (1M context GA, March 2026)
  'claude-opus-4-6': 1_000_000,
  'claude-sonnet-4-6': 1_000_000,
  // Anthropic — Claude 4.x standard (200K)
  'claude-opus-4': 200_000,
  'claude-sonnet-4': 200_000,
  'claude-haiku-4': 200_000,
  // Anthropic — Claude 3.x (legacy)
  'claude-3-7': 200_000,
  'claude-3-5-sonnet': 200_000,
  'claude-3-5-haiku': 200_000,
  'claude-3-haiku': 200_000,
  'claude-3-opus': 200_000,

  // Google Gemini 3.x (released 2026)
  'gemini-3.1-pro': 1_000_000,
  'gemini-3.1-flash': 1_000_000,
  'gemini-3.0-pro': 1_000_000,
  'gemini-3.0-flash': 200_000,
  'gemini-3': 1_000_000,
  // Google Gemini 2.x
  'gemini-2.5-flash': 1_000_000,
  'gemini-2.5-pro': 1_000_000,
  'gemini-2.0-flash': 1_000_000,
  // Gemini 1.x (legacy)
  'gemini-1.5-flash': 1_000_000,
  'gemini-1.5-pro': 2_000_000,

  // Ollama / local models
  llama4: 10_000_000, // Llama 4 Scout — 10M context
  'llama3.3': 128_000,
  'llama3.2': 128_000,
  'llama3.1': 128_000,
  llama3: 8_000,
  qwen3: 128_000, // supports 128K; Ollama default is 4K — set num_ctx explicitly
  'qwen2.5': 128_000,
  'deepseek-v3': 128_000,
  'deepseek-r1': 128_000,
  'deepseek-coder': 16_000,
  mistral: 32_000,
  mixtral: 32_000,
  codestral: 32_000,
  phi4: 16_000,
  gemma3: 128_000,

  default: 32_000,
};

// ─── Live Cache ───────────────────────────────────────────────────────────────
// Populated at runtime by fetchAndCacheContextWindows().
// Keys are exact lowercase model IDs returned by provider APIs.
const liveCache: Record<string, number> = {};

/**
 * Fetches context window sizes from provider APIs and populates the live cache.
 * Call this whenever the active provider changes (e.g. after saving provider settings).
 *
 * Failures are silenced — the static fallback table is always available.
 */
export async function fetchAndCacheContextWindows(opts: {
  providerType: 'openai' | 'anthropic' | 'gemini' | 'ollama';
  apiKey?: string;
}): Promise<void> {
  const { providerType, apiKey } = opts;

  try {
    switch (providerType) {
      case 'openai': {
        if (!apiKey) return;
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        (data.data as Array<{ id: string; context_window?: number }>).forEach(
          (m) => {
            if (m.context_window) {
              liveCache[m.id.toLowerCase()] = m.context_window;
            }
          },
        );
        console.log(
          `[tokenEstimator] Cached ${Object.keys(liveCache).length} OpenAI context windows`,
        );
        break;
      }

      case 'gemini': {
        if (!apiKey) return;
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        (
          data.models as Array<{ name: string; inputTokenLimit?: number }>
        ).forEach((m) => {
          if (m.inputTokenLimit) {
            // name is "models/gemini-2.5-pro" — extract the id part
            const id = m.name.split('/').pop()?.toLowerCase();
            if (id) liveCache[id] = m.inputTokenLimit;
          }
        });
        console.log(
          `[tokenEstimator] Cached ${Object.keys(liveCache).length} Gemini context windows`,
        );
        break;
      }

      case 'ollama': {
        // Ollama /api/tags doesn't include context window — rely on fallback table.
        break;
      }

      case 'anthropic': {
        // Anthropic has no public models API — rely on fallback table.
        break;
      }

      default:
        break;
    }
  } catch (error) {
    // Silently fall back to static table — never throw from here
    console.error('[tokenEstimator] Failed to fetch context windows:', error);
  }
}

/**
 * Estimates token count for a string or serializable object.
 * @param input - Text string or object to serialize
 * @returns Estimated token count (slightly conservative)
 */
export function estimateTokens(
  input: string | object | null | undefined,
): number {
  if (!input) return 0;
  const text = typeof input === 'string' ? input : JSON.stringify(input);
  // 3 chars/token (conservative over-estimate)
  return Math.ceil(text.length / 3);
}

/**
 * Estimates tokens for an array of chat messages.
 * Includes per-message overhead for role etc.
 */
export function estimateMessagesTokens(
  messages: Array<{
    role: string;
    content: any;
    contextItems?: any[];
    toolCalls?: any[];
  }>,
): number {
  return messages.reduce((sum, msg) => {
    const contentStr =
      typeof msg.content === 'string'
        ? msg.content
        : JSON.stringify(msg.content);

    let tokens = estimateTokens(contentStr);

    if (msg.contextItems?.length) {
      tokens += msg.contextItems.reduce(
        (cSum, ctx) => cSum + estimateTokens(ctx.content ?? ''),
        0,
      );
    }

    if (msg.toolCalls?.length) {
      tokens += msg.toolCalls.reduce((tcSum, tc) => {
        const inputStr =
          typeof tc.toolInput === 'string'
            ? tc.toolInput
            : JSON.stringify(tc.toolInput ?? tc.args ?? '');
        const outputStr =
          typeof tc.toolOutput === 'string'
            ? tc.toolOutput
            : JSON.stringify(tc.toolOutput ?? tc.result ?? '');
        return tcSum + estimateTokens(inputStr) + estimateTokens(outputStr);
      }, 0);
    }

    // ~4 tokens overhead per message (role, separators)
    return sum + tokens + 4;
  }, 0);
}

/**
 * Returns the context window size for a given model ID.
 * Checks the live cache (populated from provider APIs) first,
 * then falls back to substring matching against the static table.
 */
export function getContextWindow(modelId: string): number {
  const normalized = (modelId || '').toLowerCase();

  // 1. Exact match in live cache
  if (liveCache[normalized]) return liveCache[normalized];

  // 2. Substring match in live cache (handles versioned suffixes like "gpt-4.1-2026-04-14")
  const liveCacheKey = Object.keys(liveCache).find((k) =>
    normalized.includes(k),
  );
  if (liveCacheKey) return liveCache[liveCacheKey];

  // 3. Substring match in static fallback table
  const fallbackKey = Object.keys(CONTEXT_WINDOWS_FALLBACK).find((k) =>
    normalized.includes(k),
  );
  return CONTEXT_WINDOWS_FALLBACK[fallbackKey ?? 'default'];
}

/**
 * Computes what % of the context window is used by a given token count.
 */
export function contextUsagePercent(tokens: number, modelId: string): number {
  const window = getContextWindow(modelId);
  if (window === 0) return 0;
  return Math.min(100, Math.round((tokens / window) * 100));
}

/**
 * Truncates a long tool result to fit within a token budget.
 * Keeps the first 2/3 and last 1/3 with a gap indicator.
 */
export function truncateToolResult(content: string, maxTokens: number): string {
  const estimate = estimateTokens(content);
  if (estimate <= maxTokens) return content;

  // approximate chars for the budget
  const maxChars = maxTokens * 3;
  const keepStart = Math.floor(maxChars * 0.67);
  const keepEnd = Math.floor(maxChars * 0.33);

  if (content.length <= keepStart + keepEnd) return content;

  const omitted = content.length - keepStart - keepEnd;
  return `${content.slice(
    0,
    keepStart,
  )}\n\n… [${omitted} characters omitted] …\n\n${content.slice(
    content.length - keepEnd,
  )}`;
}
