// dbt Charts (PyPI `dbt-charts`, CLI `dct`) shared by the main process and the
// project editor. Path helpers are string based (no Node `path`) so the
// renderer can use them too; they accept both `/` and `\` separators.

export const DBT_CHARTS_VERSION = '0.11.1';
export const DBT_CHARTS_PYTHON = '3.12.10';
export const CHARTS_DIR = 'charts';
export const DBT_CHARTS_INSTALL_TASK = 'install:dbt-charts';
export const DBT_CHARTS_REFRESH_MUTATION = 'dbt-charts-preview-refresh';
// The board <webview>'s session partition (in memory, not persisted). Main
// identifies the board webview by it; no other webview uses it.
export const DBT_CHARTS_WEBVIEW_PARTITION = 'dbt-charts';

const YAML_FILE = /\.ya?ml$/i;

const toSegments = (filePath: string): string[] =>
  filePath.split(/[\\/]+/).filter((segment) => segment.length > 0);

const isWindowsDrivePath = (filePath: string) => /^[a-zA-Z]:/.test(filePath);

// Windows paths compare case-insensitively; POSIX paths do not.
const sameSegment = (a: string, b: string, caseInsensitive: boolean) =>
  caseInsensitive ? a.toLowerCase() === b.toLowerCase() : a === b;

/**
 * The path of `filePath` relative to `projectPath` as `/`-separated
 * segments, or null when the file is not inside the project.
 */
export const relativeSegments = (
  projectPath: string,
  filePath: string,
): string[] | null => {
  if (!projectPath || !filePath) return null;
  const caseInsensitive = isWindowsDrivePath(projectPath);
  const root = toSegments(projectPath);
  const file = toSegments(filePath);
  if (file.length <= root.length) return null;
  const inside = root.every((segment, index) =>
    sameSegment(segment, file[index], caseInsensitive),
  );
  if (!inside) return null;
  const rest = file.slice(root.length);
  if (rest.some((segment) => segment === '..' || segment === '.')) return null;
  return rest;
};

/**
 * True for `.yml` / `.yaml` files anywhere under the project-root `charts/`
 * folder (boards, partials and `meta.yml`). `models/charts/x.yml` and
 * `dbt_charts.yml` are not.
 */
export const isChartsBoardPath = (
  projectPath: string,
  filePath: string,
): boolean => {
  const rest = relativeSegments(projectPath, filePath);
  if (!rest || rest.length < 2) return false;
  return rest[0] === CHARTS_DIR && YAML_FILE.test(rest[rest.length - 1]);
};

/** Loose check used where the project path is not known (file-view match). */
export const looksLikeChartsPath = (filePath: string): boolean => {
  const segments = toSegments(filePath);
  return (
    YAML_FILE.test(segments[segments.length - 1] ?? '') &&
    segments.slice(0, -1).includes(CHARTS_DIR)
  );
};

/** Partials (`_name.yml`) and `meta.yml` have no page of their own. */
export const isChartsPartial = (filePath: string): boolean => {
  const segments = toSegments(filePath);
  const name = segments[segments.length - 1] ?? '';
  return name.startsWith('_') || /^meta\.ya?ml$/i.test(name);
};

const encodePath = (segments: string[]) =>
  segments.length === 0
    ? '/'
    : `/${segments.map((segment) => encodeURIComponent(segment)).join('/')}/`;

/**
 * The `dct serve` URL path of a board: `charts/index.yml` → `/`,
 * `charts/sales.yml` → `/sales/`, `charts/a/b.yaml` → `/a/b/`.
 */
export const boardUrlPath = (projectPath: string, filePath: string): string => {
  const rest = relativeSegments(projectPath, filePath);
  if (!rest || rest[0] !== CHARTS_DIR) return '/';
  const inside = rest.slice(1);
  const name = (inside.pop() ?? '').replace(YAML_FILE, '');
  if (name.toLowerCase() !== 'index') inside.push(name);
  return encodePath(inside);
};

/** The folder index URL for a partial: `charts/a/_p.yml` → `/a/`. */
export const folderUrlPath = (
  projectPath: string,
  filePath: string,
): string => {
  const rest = relativeSegments(projectPath, filePath);
  if (!rest || rest[0] !== CHARTS_DIR) return '/';
  return encodePath(rest.slice(1, -1));
};

/** `charts/sales.yml` style project-relative path with `/` separators. */
export const chartsRelativePath = (
  projectPath: string,
  filePath: string,
): string | null => {
  const rest = relativeSegments(projectPath, filePath);
  return rest ? rest.join('/') : null;
};

// ─── DTOs ────────────────────────────────────────────────────────────────────

export interface ChartsDiagnostic {
  severity: 'error' | 'warning';
  code?: string;
  message: string;
  // dct's suggested edit, when it has one.
  fix?: string;
  // Project-relative, `/`-separated, when dct reports it.
  file?: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

export interface ChartsValidationResult {
  diagnostics: ChartsDiagnostic[];
  errorCount: number;
  warningCount: number;
  // The process could not run or gave unreadable output.
  failed?: boolean;
}

export interface DbtChartsStatus {
  installed: boolean;
  version: string | null;
  pythonVersion: string | null;
  extras: string[];
}

export interface DbtChartsAdapterSupport {
  supported: boolean;
  // The dbt-charts extra the adapter needs (none for DuckDB).
  extra?: string;
  reason?: string;
}

export interface ProjectChartsState {
  // dbt-charts itself is installed (the adapter extra may still be missing).
  installed: boolean;
  adapter: string | null;
  support: DbtChartsAdapterSupport;
  extraInstalled: boolean;
  manifestExists: boolean;
  hasChartsDir: boolean;
  hasConfig: boolean;
}

export type ChartsServerState =
  | 'stopped'
  | 'parsing'
  | 'parse-failed'
  | 'starting'
  | 'running'
  | 'crashed';

export interface ChartsServerStatus {
  projectPath: string | null;
  state: ChartsServerState;
  url?: string;
  // Last redacted output lines, for the crashed / parse-failed states.
  lines?: string[];
  error?: string;
  // The dct process while it starts or runs (the CHARTS SERVER tab).
  pid?: number;
  // Epoch ms when dct was spawned.
  startedAt?: number;
  // `dct serve …` as run (no secrets: host, port and project dir only).
  command?: string;
  // Stopped from the CHARTS SERVER tab: board tabs wait for Start.
  userStopped?: boolean;
}

/** New lines in the server log; `reset` drops the lines shown so far. */
export interface ChartsServerLogEvent {
  projectPath: string;
  lines: string[];
  reset?: boolean;
}

export interface ChartsInstallLine {
  line: string;
}

export interface ChartsParseResult {
  ok: boolean;
  // Last redacted output lines when it failed.
  lines: string[];
}
