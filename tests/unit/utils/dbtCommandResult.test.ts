import { extractCliErrorDetails } from '../../../src/renderer/utils/dbtCommandResult';

describe('dbt command result detection', () => {
  it('treats a nonzero process exit as a failure without relying on output', () => {
    expect(extractCliErrorDetails([], [], 139)).toEqual([
      'Process exited with code 139',
    ]);
  });

  it('does not report a successful empty result as a failure', () => {
    expect(extractCliErrorDetails([], [], 0)).toEqual([]);
  });
});
