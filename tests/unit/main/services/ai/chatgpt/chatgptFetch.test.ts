/**
 * @jest-environment ./tests/unit/__setup__/nodeWithWindow.environment.js
 */
import { generateObject, generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import {
  ChatGptUsageLimitError,
  createChatGptFetch,
  shapeRequestBody,
} from '../../../../../../src/main/services/ai/chatgpt/chatgptFetch';
import { createChatGptModel } from '../../../../../../src/main/services/ai/chatgpt/chatgptModel';
import type { ChatGptCredential } from '../../../../../../src/main/services/ai/chatgpt/chatgptOAuth';
import { jsonResponse, sseResponse } from './chatgptTestUtils';

const credential: ChatGptCredential = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresAt: Date.now() + 3600_000,
  accountId: 'acct-1',
  email: null,
  planType: 'plus',
};

const completed = (output: unknown[]) => ({
  type: 'response.completed',
  response: {
    id: 'resp_1',
    object: 'response',
    created_at: 1_700_000_000,
    model: 'gpt-5.5',
    status: 'completed',
    output,
    incomplete_details: null,
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
  },
});

const textMessage = (text: string) => ({
  type: 'message',
  id: 'msg_1',
  role: 'assistant',
  status: 'completed',
  content: [{ type: 'output_text', text, annotations: [] }],
});

describe('shapeRequestBody (request contract)', () => {
  it('moves system messages into instructions and forces ChatGPT fields', () => {
    const shaped = shapeRequestBody({
      model: 'gpt-5.5',
      input: [
        { role: 'system', content: 'You are the Project agent.' },
        {
          role: 'developer',
          content: [{ type: 'input_text', text: 'Be brief.' }],
        },
        { role: 'user', content: 'hi' },
      ],
      store: true,
      stream: false,
      max_output_tokens: 500,
    });

    expect(shaped.instructions).toBe('You are the Project agent.\n\nBe brief.');
    expect(shaped.input).toEqual([{ role: 'user', content: 'hi' }]);
    expect(shaped.store).toBe(false);
    expect(shaped.stream).toBe(true);
    expect(shaped).not.toHaveProperty('max_output_tokens');
  });

  it('sends only function tools, without strict, and never hosted tools (D9)', () => {
    const shaped = shapeRequestBody({
      input: [],
      tools: [
        {
          type: 'function',
          name: 'runDbtCommand',
          parameters: {},
          strict: true,
        },
        { type: 'web_search' },
        { type: 'code_interpreter', container: { type: 'auto' } },
        { type: 'file_search', vector_store_ids: ['vs'] },
        { type: 'computer_use_preview' },
      ],
    });
    expect(shaped.tools).toEqual([
      { type: 'function', name: 'runDbtCommand', parameters: {} },
    ]);
  });

  it('drops tool_choice when no function tools are left', () => {
    const shaped = shapeRequestBody({
      input: [],
      tools: [{ type: 'web_search' }],
      tool_choice: 'auto',
    });
    expect(shaped).not.toHaveProperty('tools');
    expect(shaped).not.toHaveProperty('tool_choice');
  });

  it('uses a neutral default when there is no system prompt', () => {
    expect(shapeRequestBody({ input: [] }).instructions).toBe(
      'You are a helpful assistant.',
    );
  });
});

describe('createChatGptFetch', () => {
  it('sets the ChatGPT headers and removes the placeholder key', async () => {
    const baseFetch = jest.fn().mockResolvedValue(sseResponse([]));
    const chatFetch = createChatGptFetch(async () => credential, baseFetch);
    await chatFetch('https://chatgpt.com/backend-api/codex/responses', {
      method: 'POST',
      headers: { Authorization: 'Bearer chatgpt-oauth' },
      body: JSON.stringify({ input: [], stream: true }),
    });

    const headers = baseFetch.mock.calls[0][1].headers as Headers;
    expect(headers.get('authorization')).toBe('Bearer access-1');
    expect(headers.get('chatgpt-account-id')).toBe('acct-1');
    expect(headers.get('openai-beta')).toBe('responses=experimental');
    expect(headers.get('originator')).toBe('dbt_studio');
    expect(headers.get('session-id')).toEqual(expect.any(String));
  });

  it('refreshes once and retries once after a 401', async () => {
    const getCredential = jest
      .fn()
      .mockResolvedValueOnce(credential)
      .mockResolvedValueOnce({ ...credential, accessToken: 'access-2' });
    const baseFetch = jest
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(sseResponse([]));
    const chatFetch = createChatGptFetch(getCredential, baseFetch);

    await chatFetch('https://x/responses', {
      body: JSON.stringify({ input: [], stream: true }),
    });

    expect(getCredential).toHaveBeenLastCalledWith({ forceRefresh: true });
    expect(baseFetch).toHaveBeenCalledTimes(2);
    expect(
      (baseFetch.mock.calls[1][1].headers as Headers).get('authorization'),
    ).toBe('Bearer access-2');
  });

  it('throws a usage-limit error with the reset time instead of returning a 429', async () => {
    const resetsAt = Math.floor(Date.now() / 1000) + 600;
    const baseFetch = jest.fn().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 'usage_limit_reached',
            plan_type: 'plus',
            resets_at: resetsAt,
          },
        },
        429,
      ),
    );
    const chatFetch = createChatGptFetch(async () => credential, baseFetch);

    const error = await chatFetch('https://x/responses', {
      body: JSON.stringify({ input: [], stream: true }),
    }).catch((e) => e);

    expect(error).toBeInstanceOf(ChatGptUsageLimitError);
    expect(error.resetsAt).toBe(resetsAt * 1000);
    expect(error.planType).toBe('plus');
    expect(error.message).toMatch(/plan limit is reached\. It resets at/);
  });

  it('turns a streamed reply into JSON for a non-streaming call', async () => {
    const baseFetch = jest
      .fn()
      .mockResolvedValue(
        sseResponse([
          { type: 'response.created' },
          completed([textMessage('hi')]),
        ]),
      );
    const chatFetch = createChatGptFetch(async () => credential, baseFetch);

    const response = await chatFetch('https://x/responses', {
      body: JSON.stringify({ input: [] }),
    });

    expect(JSON.parse(baseFetch.mock.calls[0][1].body).stream).toBe(true);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect((await response.json()).id).toBe('resp_1');
  });
});

describe('ChatGPT model through the AI SDK', () => {
  const bodies = (baseFetch: jest.Mock) =>
    baseFetch.mock.calls.map(([, init]) => JSON.parse(init.body));

  it('sends store:false and only our tools, and never runs a tool we did not register (D9)', async () => {
    const baseFetch = jest
      .fn()
      .mockResolvedValueOnce(
        sseResponse([
          completed([
            {
              type: 'function_call',
              id: 'fc_1',
              call_id: 'call_1',
              name: 'bash',
              arguments: '{"command":"rm -rf /"}',
              status: 'completed',
            },
          ]),
        ]),
      )
      .mockResolvedValueOnce(sseResponse([completed([textMessage('done')])]));
    const listModels = jest.fn(async () => ['orders']);

    const result = await generateText({
      model: createChatGptModel(async () => credential, 'gpt-5.5', baseFetch),
      system: 'You are the Project agent.',
      prompt: 'List models',
      tools: {
        listModels: tool({
          description: 'List dbt models',
          inputSchema: z.object({}),
          execute: listModels,
        }),
      },
      stopWhen: stepCountIs(2),
    });

    const [first, second] = bodies(baseFetch);
    expect(first.store).toBe(false);
    expect(first.instructions).toBe('You are the Project agent.');
    expect(first.tools.map((t: { name: string }) => t.name)).toEqual([
      'listModels',
    ]);
    expect(JSON.stringify(first)).not.toMatch(/apply_patch|"shell"/);

    // The model asked for `bash`: nothing ran, and it got an error back.
    expect(listModels).not.toHaveBeenCalled();
    const bashResult = second.input.find(
      (item: { type?: string; call_id?: string }) =>
        item.type === 'function_call_output' && item.call_id === 'call_1',
    );
    expect(bashResult).toBeDefined();
    expect(bashResult.output).toMatch(/unavailable tool 'bash'/);
    expect(second.input).not.toContainEqual(
      expect.objectContaining({ type: 'item_reference' }),
    );
    expect(result.text).toBe('done');
  });

  it('accepts a structured-output schema with optional fields (C1)', async () => {
    const baseFetch = jest
      .fn()
      .mockResolvedValue(
        sseResponse([completed([textMessage('{"title":"Orders"}')])]),
      );

    const { object } = await generateObject({
      model: createChatGptModel(async () => credential, 'gpt-5.5', baseFetch),
      schema: z.object({ title: z.string(), note: z.string().optional() }),
      prompt: 'Title?',
    });

    expect(object).toEqual({ title: 'Orders' });
    const [body] = bodies(baseFetch);
    expect(body.text.format.strict).toBe(false);
  });
});
