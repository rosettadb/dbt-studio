const secretPatterns = [
  /\b(?:api[_-]?key|password|secret|token|authorization|credentials?|keyfile|access[_-]?key|refresh[_-]?token|private[_-]?key|client[_-]?secret)\b["']?\s*[:=]\s*["']?[^\s"',}]{6,}/giu,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/giu,
  /\b(?:sk|ghp|github_pat)_[a-z0-9_-]{12,}\b/giu,
  /\b(?:postgres|mysql|mongodb(?:\+srv)?):\/\/[^\s]+/giu,
];

export const containsLikelySecondBrainSecret = (value: string): boolean =>
  secretPatterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });

export const redactLikelySecondBrainSecrets = (value: string): string => {
  return secretPatterns.reduce((result, pattern) => {
    pattern.lastIndex = 0;
    return result.replace(pattern, '[REDACTED]');
  }, value);
};
