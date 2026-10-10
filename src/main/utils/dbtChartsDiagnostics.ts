import type { DbtChartsDiagnostic } from '../../types/backend';

type Raw = Record<string, unknown>;

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const toDiagnostic = (
  raw: Raw,
  severity: DbtChartsDiagnostic['severity'],
): DbtChartsDiagnostic => {
  const range = (raw.range ?? {}) as Raw;
  const columns = (range.columns ?? {}) as Raw;
  const line = asNumber(range.start_line);
  const column = asNumber(columns.start_col);
  return {
    severity,
    code: String(raw.code ?? 'unknown'),
    message: String(raw.message ?? ''),
    ...(line !== undefined ? { line } : {}),
    ...(column !== undefined ? { column } : {}),
  };
};

/**
 * The ONLY place that knows the field names of `dct validate --json`
 * (recorded from dbt-charts 0.9.1, see fixtures/dctValidate.json).
 *
 * One path gives an object, several paths give an array of them:
 *   { success, path, errors: [Entry], warnings: [Entry] }
 *   Entry = { code, message, path, range: { start_line, columns: { start_col } } }
 */
export function parseDctValidateOutput(stdout: string): DbtChartsDiagnostic[] {
  const parsed = JSON.parse(stdout) as unknown;
  const results = (Array.isArray(parsed) ? parsed : [parsed]) as Raw[];
  const out: DbtChartsDiagnostic[] = [];
  results.forEach((result) => {
    const errors = Array.isArray(result?.errors)
      ? (result.errors as Raw[])
      : [];
    const warnings = Array.isArray(result?.warnings)
      ? (result.warnings as Raw[])
      : [];
    errors.forEach((e) => out.push(toDiagnostic(e, 'error')));
    warnings.forEach((w) => out.push(toDiagnostic(w, 'warning')));
  });
  return out;
}
