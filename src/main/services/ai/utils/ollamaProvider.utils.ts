export const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';

export function normalizeOllamaBaseUrl(baseUrl?: string): string {
  const value = baseUrl?.trim().replace(/\/+$/, '') || DEFAULT_OLLAMA_BASE_URL;
  return value.endsWith('/api') ? value.slice(0, -4) : value;
}

export function isLocalOllamaUrl(baseUrl?: string): boolean {
  const value = normalizeOllamaBaseUrl(baseUrl);

  try {
    const parsed = new URL(value);
    return (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1'
    );
  } catch {
    const lowerValue = value.toLowerCase();
    return lowerValue.includes('localhost') || lowerValue.includes('127.0.0.1');
  }
}

export function isHostedOllamaCloudUrl(baseUrl?: string): boolean {
  const isOllamaCloudHostname = (hostname: string): boolean => {
    const normalizedHostname = hostname.toLowerCase();
    return (
      normalizedHostname === 'ollama.com' ||
      normalizedHostname.endsWith('.ollama.com')
    );
  };

  try {
    return isOllamaCloudHostname(
      new URL(normalizeOllamaBaseUrl(baseUrl)).hostname,
    );
  } catch {
    const match = normalizeOllamaBaseUrl(baseUrl)
      .toLowerCase()
      .match(/^(?:https?:\/\/)?([^/:?#]+)/);

    return Boolean(match?.[1] && isOllamaCloudHostname(match[1]));
  }
}

export function isRemoteOllamaUrl(baseUrl?: string): boolean {
  return !isLocalOllamaUrl(baseUrl);
}

export function shouldAttachOllamaAuth(
  baseUrl?: string,
  apiKey?: string | null,
): boolean {
  return isRemoteOllamaUrl(baseUrl) && Boolean(apiKey?.trim());
}

export function buildOllamaHeaders(
  apiKey?: string | null,
): Record<string, string> | undefined {
  if (!apiKey?.trim()) {
    return undefined;
  }

  return { Authorization: `Bearer ${apiKey.trim()}` };
}

export function buildOllamaTagsUrl(baseUrl?: string): string {
  const normalizedBaseUrl = normalizeOllamaBaseUrl(baseUrl);
  return `${normalizedBaseUrl}/api/tags`;
}
