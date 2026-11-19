import {
  diagnosticsForFile,
  parseValidateJson,
} from '../../../../src/main/utils/dbtChartsDiagnostics';

// Shapes from dbt-charts 0.11.1: ValidateResult
// (src/dbt_charts/agent_api/validate.py) and Diagnostic
// (src/dbt_charts/core/diagnostics/diagnostic.py), dumped with
// exclude_none=True.
const validBoard = {
  success: true,
  path: 'charts/sales.yml',
  errors: [],
  warnings: [],
};

const unknownKey = {
  success: false,
  path: 'charts/sales.yml',
  errors: [
    {
      code: 'ERR-EXTRA-FIELD',
      message: 'Unknown key `colour` on chart `revenue`.',
      fix: 'Use one of: color, ...',
      path: 'charts.revenue',
      range: {
        file: 'charts/sales.yml',
        start_line: 12,
        end_line: 12,
        columns: { start_col: 5, end_col: 11 },
      },
      level: 'error',
      fields: {},
      related: [],
    },
  ],
  warnings: [
    {
      code: 'WARN-ADJACENT-TEXT-ROWS',
      message: 'Two text rows in a row.',
      range: { file: 'charts/sales.yml', start_line: 30, end_line: 31 },
      level: 'warning',
    },
  ],
};

describe('parseValidateJson', () => {
  it('returns no diagnostics for a valid board', () => {
    const result = parseValidateJson(JSON.stringify(validBoard), '', 0);
    expect(result).toEqual({ diagnostics: [], errorCount: 0, warningCount: 0 });
  });

  it('maps errors and warnings with their ranges', () => {
    const result = parseValidateJson(
      JSON.stringify(unknownKey, null, 2),
      '',
      1,
    );
    expect(result.errorCount).toBe(1);
    expect(result.warningCount).toBe(1);
    expect(result.diagnostics[0]).toEqual({
      severity: 'error',
      code: 'ERR-EXTRA-FIELD',
      message: 'Unknown key `colour` on chart `revenue`.',
      fix: 'Use one of: color, ...',
      file: 'charts/sales.yml',
      line: 12,
      endLine: 12,
      column: 5,
      endColumn: 11,
    });
    // No columns: the whole line.
    expect(result.diagnostics[1]).toMatchObject({
      severity: 'warning',
      line: 30,
      endLine: 31,
      column: undefined,
    });
  });

  it('reads an array when several files were validated', () => {
    const result = parseValidateJson(
      JSON.stringify([validBoard, unknownKey]),
      '',
      1,
    );
    expect(result.errorCount).toBe(1);
  });

  it('falls back to the result path when a diagnostic has no range', () => {
    const result = parseValidateJson(
      JSON.stringify({
        success: false,
        path: 'charts\\a.yml',
        errors: [
          { code: 'ERR-DBT-MANIFEST-MISSING', message: 'Run dbt parse.' },
        ],
      }),
      '',
      1,
    );
    expect(result.diagnostics[0]).toMatchObject({
      file: 'charts/a.yml',
      line: undefined,
    });
  });

  it('reports a host refusal as one error', () => {
    const result = parseValidateJson(
      JSON.stringify({
        success: false,
        path: 'charts/a.yml',
        error: 'Access denied',
      }),
      '',
      1,
    );
    expect(result.diagnostics).toEqual([
      {
        severity: 'error',
        message: 'Access denied',
        file: 'charts/a.yml',
        line: 1,
      },
    ]);
  });

  it('turns unreadable output into one line-1 error from stderr', () => {
    const result = parseValidateJson('Traceback ...', 'boom', 2);
    expect(result).toMatchObject({ errorCount: 1, failed: true });
    expect(result.diagnostics[0]).toMatchObject({ message: 'boom', line: 1 });
  });

  it('treats empty output with exit 0 as clean', () => {
    expect(parseValidateJson('', '', 0).diagnostics).toEqual([]);
  });

  it('skips a log line printed before the JSON', () => {
    const result = parseValidateJson(
      `Auto-detected dialect: duckdb\n${JSON.stringify(validBoard)}`,
      '',
      0,
    );
    expect(result.errorCount).toBe(0);
  });
});

describe('diagnosticsForFile', () => {
  it('keeps findings for one file', () => {
    const parsed = parseValidateJson(
      JSON.stringify([
        unknownKey,
        {
          success: false,
          path: 'charts/other.yml',
          errors: [{ code: 'ERR-UNKNOWN-QUERY', message: 'x' }],
        },
      ]),
      '',
      1,
    );
    const mine = diagnosticsForFile(parsed, 'charts/other.yml');
    expect(mine.errorCount).toBe(1);
    expect(mine.warningCount).toBe(0);
  });
});
