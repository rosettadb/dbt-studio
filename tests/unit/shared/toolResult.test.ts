import {
  getToolResultError,
  isToolResultFailure,
} from '../../../src/shared/toolResult';

describe('tool result envelopes', () => {
  it('recognizes explicit dbt tool failures', () => {
    const result = {
      ok: false,
      error: 'Command failed with code 1',
      data: { exitCode: 1 },
    };

    expect(isToolResultFailure(result)).toBe(true);
    expect(getToolResultError(result)).toBe('Command failed with code 1');
  });

  it('does not mark successful envelopes as failures', () => {
    expect(isToolResultFailure({ ok: true })).toBe(false);
    expect(isToolResultFailure({ success: true })).toBe(false);
  });
});
