import fixture from './fixtures/dctValidate.json';
import { parseDctValidateOutput } from '../../../../src/main/utils/dbtChartsDiagnostics';

describe('parseDctValidateOutput', () => {
  it('maps the recorded dct 0.9.1 output to Diagnostic[] with lines', () => {
    expect(parseDctValidateOutput(JSON.stringify(fixture))).toEqual([
      {
        severity: 'error',
        code: 'ERR-UNKNOWN-QUERY',
        message: expect.stringContaining("unknown query 'missing'"),
        line: 12,
        column: 5,
      },
      {
        severity: 'warning',
        code: 'WARN-SINGLE-CHART-REDUNDANT-TITLE',
        message: expect.any(String),
        line: 16,
        column: 5,
      },
    ]);
  });

  it('accepts a single-file object and a clean result', () => {
    expect(
      parseDctValidateOutput(
        '{"success": true, "path": "a.yml", "errors": [], "warnings": []}',
      ),
    ).toEqual([]);
    expect(parseDctValidateOutput('[]')).toEqual([]);
  });

  it('throws on non-JSON output', () => {
    expect(() => parseDctValidateOutput('Traceback...')).toThrow();
  });
});
