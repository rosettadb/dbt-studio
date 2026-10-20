const b64 = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

export const makeJwt = (payload: Record<string, unknown>) =>
  `${b64({ alg: 'none' })}.${b64(payload)}.sig`;

export const makeAccessToken = (
  accountId: string | null = 'acct-1',
  planType = 'plus',
) =>
  makeJwt({
    'https://api.openai.com/auth': accountId
      ? { chatgpt_account_id: accountId, chatgpt_plan_type: planType }
      : {},
  });

export const tokenResponse = (overrides: Record<string, unknown> = {}) => ({
  access_token: makeAccessToken(),
  refresh_token: 'refresh-1',
  id_token: makeJwt({ email: 'ada@example.com' }),
  expires_in: 3600,
  ...overrides,
});

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export const sseResponse = (events: unknown[]) =>
  new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );
