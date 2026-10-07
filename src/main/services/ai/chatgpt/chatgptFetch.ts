/**
 * The `fetch` that `@ai-sdk/openai` uses for a ChatGPT sign-in (Plan 71).
 * All ChatGPT-specific request behavior lives here, so the agents, tools
 * and run loop stay unchanged:
 *
 * - fresh OAuth token on every request (long runs outlive the token);
 * - ChatGPT headers; the placeholder API key header is removed;
 * - body shaped for the ChatGPT endpoint: system messages become
 *   `instructions`, `store: false`, `stream: true`, no `max_output_tokens`;
 * - only `function` tools are sent: no OpenAI-hosted tools, ever (D9);
 * - non-streaming calls (generateText/generateObject) are streamed on the
 *   wire and turned back into a JSON response, because the endpoint only
 *   streams;
 * - 401 → one forced refresh and one retry; usage limits → a typed error.
 */
import { randomUUID } from 'crypto';
import { CHATGPT_ORIGINATOR, ChatGptCredential } from './chatgptOAuth';

export type ChatGptCredentialSource = (options?: {
  forceRefresh?: boolean;
}) => Promise<ChatGptCredential>;

function usageLimitMessage(resetsAt: number | null): string {
  if (!resetsAt) return 'Your ChatGPT plan limit is reached.';
  const time = new Date(resetsAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `Your ChatGPT plan limit is reached. It resets at ${time}.`;
}

export class ChatGptUsageLimitError extends Error {
  readonly resetsAt: number | null;

  readonly planType: string | null;

  constructor(resetsAt: number | null, planType: string | null) {
    super(usageLimitMessage(resetsAt));
    this.name = 'ChatGptUsageLimitError';
    this.resetsAt = resetsAt;
    this.planType = planType;
  }
}

const USAGE_LIMIT_CODES =
  /usage_limit_reached|usage_not_included|rate_limit_exceeded/i;

type InputItem = { role?: string; content?: unknown; [key: string]: unknown };

function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part && typeof part === 'object' && 'text' in part
          ? String((part as { text: unknown }).text ?? '')
          : '',
      )
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

/** Exported for the request contract test. */
export function shapeRequestBody(body: Record<string, unknown>) {
  const shaped: Record<string, unknown> = { ...body };
  const input = Array.isArray(body.input) ? (body.input as InputItem[]) : [];
  const isSystem = (item: InputItem) =>
    item?.role === 'system' || item?.role === 'developer';

  const systemText = input
    .filter(isSystem)
    .map((item) => contentText(item.content))
    .filter(Boolean)
    .join('\n\n');
  const existing =
    typeof body.instructions === 'string' ? body.instructions : '';
  shaped.instructions =
    [existing, systemText].filter(Boolean).join('\n\n') ||
    'You are a helpful assistant.';
  shaped.input = input.filter((item) => !isSystem(item));

  shaped.store = false;
  shaped.stream = true;
  delete shaped.max_output_tokens;

  if (Array.isArray(body.tools)) {
    const functionTools = (body.tools as Array<Record<string, unknown>>)
      .filter((tool) => tool?.type === 'function')
      .map((tool) => {
        // ChatGPT expects tools without `strict`, as the Codex CLI sends them.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { strict, ...rest } = tool;
        return rest;
      });
    if (functionTools.length > 0) {
      shaped.tools = functionTools;
    } else {
      delete shaped.tools;
      delete shaped.tool_choice;
    }
  }

  return shaped;
}

/**
 * Reads an SSE stream from the Responses API and returns the final
 * response object, which is what a non-streaming call would have returned.
 */
async function collectFinalResponse(response: Response): Promise<Response> {
  const text = await response.text();
  let finalResponse: unknown = null;
  let failure: unknown = null;
  text.split('\n').forEach((line) => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') return;
    try {
      const event = JSON.parse(data);
      if (
        event?.type === 'response.completed' ||
        event?.type === 'response.done'
      ) {
        finalResponse = event.response;
      } else if (event?.type === 'response.failed' || event?.type === 'error') {
        failure = event.response?.error ?? event.error ?? event;
      }
    } catch {
      // Ignore partial or non-JSON lines.
    }
  });

  if (finalResponse) {
    return new Response(JSON.stringify(finalResponse), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response(
    JSON.stringify({
      error: failure ?? { message: 'ChatGPT returned no response.' },
    }),
    { status: 502, headers: { 'content-type': 'application/json' } },
  );
}

async function throwIfUsageLimited(response: Response): Promise<void> {
  if (response.status !== 429 && response.status !== 403) return;
  const body = await response
    .clone()
    .json()
    .catch(() => null);
  const error = body?.error ?? {};
  const code = String(error.code ?? error.type ?? '');
  if (response.status === 429 || USAGE_LIMIT_CODES.test(code)) {
    const resetsAt =
      typeof error.resets_at === 'number' ? error.resets_at * 1000 : null;
    const planType =
      typeof error.plan_type === 'string' ? error.plan_type : null;
    // Thrown (not returned) so the AI SDK doesn't retry a usage limit.
    throw new ChatGptUsageLimitError(resetsAt, planType);
  }
}

export function createChatGptFetch(
  getCredential: ChatGptCredentialSource,
  baseFetch: typeof fetch = fetch,
): typeof fetch {
  // One session ID per model instance (one agent run), as the Codex CLI does.
  const sessionId = randomUUID();

  const chatGptFetch = async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ): Promise<Response> => {
    let wantsJson = false;
    let body = init?.body;
    if (typeof body === 'string') {
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        wantsJson = parsed.stream !== true;
        body = JSON.stringify(shapeRequestBody(parsed));
      } catch {
        // Not JSON: send unchanged.
      }
    }

    const send = async (credential: ChatGptCredential) => {
      const headers = new Headers(init?.headers);
      headers.delete('authorization');
      headers.delete('x-api-key');
      headers.set('Authorization', `Bearer ${credential.accessToken}`);
      headers.set('ChatGPT-Account-Id', credential.accountId);
      headers.set('OpenAI-Beta', 'responses=experimental');
      headers.set('originator', CHATGPT_ORIGINATOR);
      headers.set('session-id', sessionId);
      headers.set('accept', 'text/event-stream');
      return baseFetch(input, { ...init, headers, body });
    };

    let response = await send(await getCredential());
    if (response.status === 401) {
      response = await send(await getCredential({ forceRefresh: true }));
    }
    await throwIfUsageLimited(response);

    if (wantsJson && response.ok) return collectFinalResponse(response);
    return response;
  };

  return chatGptFetch as typeof fetch;
}
