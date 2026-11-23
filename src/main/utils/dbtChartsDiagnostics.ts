import type {
  ChartsDiagnostic,
  ChartsValidationResult,
} from '../../shared/dbtCharts';

// `dct validate --json` (dbt-charts 0.11.1) prints one ValidateResult when one
// file was validated and an array otherwise
// (src/dbt_charts/cli/commands/validate.py):
//   { success, path, error?, errors: Diagnostic[], warnings: Diagnostic[] }
// A Diagnostic (src/dbt_charts/core/diagnostics/diagnostic.py) carries
//   code, message, fix?, hint?, level, range?: { file, start_line, end_line,
//   columns?: { start_col, end_col } }   (1-based; no columns = whole line)

type RawRecord = Record<string, unknown>;

const asRecord = (value: unknown): RawRecord | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as RawRecord)
    : null;

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const toPosixPath = (value: string) => value.replace(/\\/g, '/');

const toDiagnostic = (
  raw: unknown,
  fallbackSeverity: 'error' | 'warning',
  fallbackFile: string | undefined,
): ChartsDiagnostic | null => {
  const record = asRecord(raw);
  if (!record) return null;
  const message = asString(record.message) ?? asString(record.code);
  if (!message) return null;
  const level =
    record.level === 'warning' || record.level === 'error'
      ? record.level
      : fallbackSeverity;
  const range = asRecord(record.range);
  const columns = asRecord(range?.columns);
  const file = asString(range?.file) ?? fallbackFile;
  return {
    severity: level,
    code: asString(record.code),
    message,
    fix: asString(record.fix) ?? asString(record.hint),
    file: file ? toPosixPath(file) : undefined,
    line: asNumber(range?.start_line),
    endLine: asNumber(range?.end_line),
    column: asNumber(columns?.start_col),
    endColumn: asNumber(columns?.end_col),
  };
};

const failure = (message: string): ChartsValidationResult => ({
  diagnostics: [{ severity: 'error', message, line: 1 }],
  errorCount: 1,
  warningCount: 0,
  failed: true,
});

const summarize = (
  diagnostics: ChartsDiagnostic[],
): ChartsValidationResult => ({
  diagnostics,
  errorCount: diagnostics.filter((d) => d.severity === 'error').length,
  warningCount: diagnostics.filter((d) => d.severity === 'warning').length,
});

/**
 * Turns `dct validate --json` output into diagnostics. Exit 0 and 1 are both
 * normal (1 = the board has errors). Anything unreadable becomes one error on
 * line 1 carrying the (already redacted) stderr.
 */
export const parseValidateJson = (
  stdout: string,
  stderr: string,
  exitCode: number | null,
): ChartsValidationResult => {
  const trimmed = stdout.trim();
  const start = trimmed.search(/[[{]/);
  if (start < 0) {
    if (exitCode === 0) return summarize([]);
    return failure(
      stderr.trim() || `dct validate exited with code ${exitCode ?? 'null'}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed.slice(start));
  } catch {
    return failure(stderr.trim() || 'dct validate printed unreadable output');
  }
  const results = Array.isArray(parsed) ? parsed : [parsed];
  const diagnostics: ChartsDiagnostic[] = [];
  results.forEach((result) => {
    const record = asRecord(result);
    if (!record) return;
    const resultPath = asString(record.path);
    const hostError = asString(record.error);
    if (hostError) {
      diagnostics.push({
        severity: 'error',
        message: hostError,
        file: resultPath ? toPosixPath(resultPath) : undefined,
        line: 1,
      });
    }
    (['errors', 'warnings'] as const).forEach((key) => {
      const list = record[key];
      if (!Array.isArray(list)) return;
      list.forEach((raw) => {
        const diagnostic = toDiagnostic(
          raw,
          key === 'errors' ? 'error' : 'warning',
          resultPath,
        );
        if (diagnostic) diagnostics.push(diagnostic);
      });
    });
  });
  return summarize(diagnostics);
};

/** Keeps the diagnostics for one project-relative file (`charts/a.yml`). */
export const diagnosticsForFile = (
  result: ChartsValidationResult,
  relativePath: string,
): ChartsValidationResult => {
  const target = toPosixPath(relativePath);
  return summarize(
    result.diagnostics.filter((d) => !d.file || d.file === target),
  );
};
