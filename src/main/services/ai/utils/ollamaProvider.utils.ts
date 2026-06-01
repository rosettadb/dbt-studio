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
  try {
    return new URL(normalizeOllamaBaseUrl(baseUrl)).hostname
      .toLowerCase()
      .endsWith('ollama.com');
  } catch {
    return normalizeOllamaBaseUrl(baseUrl).toLowerCase().includes('ollama.com');
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
