jest.mock(
  'monaco-editor',
  () => ({
    MarkerSeverity: { Error: 8, Warning: 4, Info: 2 },
    editor: { setModelMarkers: jest.fn() },
  }),
  { virtual: true },
);
// eslint-disable-next-line import/first
import { diagnosticsToMarkers } from '../../../../src/renderer/components/dbtCharts/useBoardMarkers';

describe('diagnosticsToMarkers', () => {
  it('maps lines and defaults missing lines to 1', () => {
    const m = diagnosticsToMarkers([
      { severity: 'error', code: 'E1', message: 'bad', line: 7, column: 3 },
      { severity: 'warning', code: 'W1', message: 'meh' },
    ]);
    expect(m[0]).toMatchObject({
      severity: 8,
      startLineNumber: 7,
      startColumn: 3,
    });
    expect(m[1]).toMatchObject({
      severity: 4,
      startLineNumber: 1,
      startColumn: 1,
    });
  });
});
