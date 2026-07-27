import {
  containsLikelySecondBrainSecret,
  redactLikelySecondBrainSecrets,
} from '../../../../../../src/main/services/ai/secondBrain/secondBrainSecrets';

describe('secondBrainSecrets', () => {
  it.each([
    ['Bearer', 'Authorization: Bearer secret-access-token'],
    ['Basic', 'Authorization: Basic dXNlcjpwYXNzd29yZA=='],
  ])('redacts the complete %s authorization credential', (_scheme, value) => {
    expect(containsLikelySecondBrainSecret(value)).toBe(true);
    expect(redactLikelySecondBrainSecrets(value)).toBe('[REDACTED]');
  });

  it('preserves generic secret assignment redaction', () => {
    expect(redactLikelySecondBrainSecrets('api_key=abcdefghijklmnop')).toBe(
      '[REDACTED]',
    );
  });
});
