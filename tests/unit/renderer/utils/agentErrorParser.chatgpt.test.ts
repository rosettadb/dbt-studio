import { parseAgentError } from '../../../../src/renderer/utils/agentErrorParser';

// Plan 71, D7: ChatGPT sign-in errors reach the renderer as serialized IPC
// errors. They must not be mistaken for a generic API-key or rate-limit error.
const serialized = (name: string, message: string) =>
  new Error(
    `__SERIALIZED_ERROR__:${JSON.stringify({ name, message, data: {} })}`,
  );

describe('parseAgentError: ChatGPT sign-in', () => {
  it('shows the plan limit with its reset time', () => {
    const parsed = parseAgentError(
      serialized(
        'ChatGptUsageLimitError',
        'Your ChatGPT plan limit is reached. It resets at 14:20.',
      ),
    );
    expect(parsed.type).toBe('chatgptUsageLimit');
    expect(parsed.title).toBe('ChatGPT Plan Limit Reached');
    expect(parsed.body).toBe(
      'Your ChatGPT plan limit is reached. It resets at 14:20. Switch to an API key provider to keep working now.',
    );
  });

  it('handles a plan limit without a reset time', () => {
    const parsed = parseAgentError(
      serialized(
        'ChatGptUsageLimitError',
        'Your ChatGPT plan limit is reached.',
      ),
    );
    expect(parsed.body).toMatch(/^Your ChatGPT plan limit is reached\. Switch/);
  });

  it('recognizes an ended sign-in before the generic auth check', () => {
    const parsed = parseAgentError(
      serialized(
        'ChatGptAuthError',
        'Sign in to ChatGPT again in Settings → AI Settings → Providers. (401)',
      ),
    );
    expect(parsed.type).toBe('chatgptSignedOut');
  });

  it('leaves other rate limits alone', () => {
    expect(parseAgentError(new Error('429 Too Many Requests')).type).toBe(
      'rateLimit',
    );
  });
});
