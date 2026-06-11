export interface ParsedAgentError {
  type:
    | 'auth'
    | 'rateLimit'
    | 'network'
    | 'toolUnsupported'
    | 'toolError'
    | 'generic';
  title: string;
  body: string;
  raw: string;
  provider?: string;
  statusCode?: number;
}

function isUnsupportedToolCallingError(lowerRaw: string): boolean {
  return (
    (lowerRaw.includes('tool') &&
      (lowerRaw.includes('not supported') ||
        lowerRaw.includes('unsupported') ||
        lowerRaw.includes('not available') ||
        lowerRaw.includes('unavailable'))) ||
    (lowerRaw.includes('function calling') &&
      (lowerRaw.includes('not supported') ||
        lowerRaw.includes('unsupported') ||
        lowerRaw.includes('not available') ||
        lowerRaw.includes('unavailable'))) ||
    (lowerRaw.includes('tool calling') &&
      (lowerRaw.includes('not supported') ||
        lowerRaw.includes('unsupported') ||
        lowerRaw.includes('not available') ||
        lowerRaw.includes('unavailable'))) ||
    lowerRaw.includes('does not support tool') ||
    lowerRaw.includes('does not support function calling') ||
    lowerRaw.includes('does not support tool calling') ||
    lowerRaw.includes('this model does not support tools') ||
    lowerRaw.includes('this model does not support tool calling') ||
    lowerRaw.includes('tools are not supported') ||
    lowerRaw.includes('tool use is not available')
  );
}

export function parseAgentError(error: unknown): ParsedAgentError {
  let raw = '';
  if (typeof error === 'string') {
    raw = error;
  } else if (error instanceof Error) {
    raw = error.message;
  } else if (error && typeof error === 'object') {
    try {
      raw = JSON.stringify(error);
    } catch {
      raw = 'Unknown object error';
    }
  } else {
    raw = String(error);
  }

  // Common patterns
  const lowerRaw = raw.toLowerCase();

  // Authentication
  if (
    lowerRaw.includes('api key') ||
    lowerRaw.includes('unauthorized') ||
    lowerRaw.includes('unauthenticated') ||
    lowerRaw.includes('401')
  ) {
    return {
      type: 'auth',
      title: 'Authentication Failed',
      body: 'Invalid or missing API key. Please check your provider settings.',
      raw,
      statusCode: 401,
    };
  }

  // Rate Limit
  if (
    lowerRaw.includes('rate limit') ||
    lowerRaw.includes('quota') ||
    lowerRaw.includes('resource_exhausted') ||
    lowerRaw.includes('429') ||
    lowerRaw.includes('credit balance') ||
    lowerRaw.includes('out of credits')
  ) {
    return {
      type: 'rateLimit',
      title: 'Rate Limit Reached',
      body: 'You have exceeded the provider quota or rate limit.',
      raw,
      statusCode: 429,
    };
  }

  // Network Error
  if (
    lowerRaw.includes('fetch') ||
    lowerRaw.includes('network') ||
    lowerRaw.includes('econnrefused') ||
    lowerRaw.includes('timeout')
  ) {
    return {
      type: 'network',
      title: 'Connection Error',
      body: 'Failed to connect to the configured AI provider. Please check your network connection or local proxy settings.',
      raw,
    };
  }

  if (isUnsupportedToolCallingError(lowerRaw)) {
    return {
      type: 'toolUnsupported',
      title: 'Tool Calling Unavailable',
      body: 'This selected model does not support tool calling. You can still use it for normal chat, but agent tools are unavailable. Switch to a more advanced model to use files, dbt, SQL, terminal, and other tools.',
      raw,
    };
  }

  return {
    type: 'generic',
    title: 'Agent Error',
    body: 'An unexpected error occurred during agent execution.',
    raw,
  };
}
