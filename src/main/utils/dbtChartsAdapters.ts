import path from 'path';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import type { DbtChartsAdapterSupport } from '../../shared/dbtCharts';

// dbt adapter name (the `type:` of a profiles.yml output) → the dbt-charts
// 0.11.1 pip extra that brings its driver (pyproject.toml
// [project.optional-dependencies]). A dbt adapter-name catalog is the
// documented exception to keeping database names inside src/connections.
// DuckDB ships with dbt-charts itself, so it needs no extra.
const ADAPTER_EXTRAS: Record<string, string | null> = {
  duckdb: null,
  postgres: 'postgresql',
  snowflake: 'snowflake',
  bigquery: 'bigquery',
  redshift: 'redshift',
  databricks: 'databricks',
  spark: 'spark',
  trino: 'trino',
  athena: 'athena',
  clickhouse: 'clickhouse',
  sqlserver: 'sqlserver',
  fabric: 'fabric',
};

const SUPPORTED_LIST = Object.keys(ADAPTER_EXTRAS).sort().join(', ');

export const supportedAdapterList = (): string => SUPPORTED_LIST;

export const extraForAdapter = (
  adapter: string | null,
): DbtChartsAdapterSupport => {
  if (!adapter) {
    return {
      supported: false,
      reason: 'No dbt target found in profiles.yml.',
    };
  }
  const key = adapter.toLowerCase();
  if (!(key in ADAPTER_EXTRAS)) {
    return {
      supported: false,
      reason: `dbt Charts can't connect to ${adapter} projects yet. Supported: ${SUPPORTED_LIST}.`,
    };
  }
  const extra = ADAPTER_EXTRAS[key];
  return extra ? { supported: true, extra } : { supported: true };
};

type YamlMap = Record<string, unknown>;

const asMap = (value: unknown): YamlMap | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as YamlMap)
    : null;

const readYaml = async (filePath: string): Promise<YamlMap | null> => {
  if (!(await fs.pathExists(filePath))) return null;
  try {
    return asMap(yaml.load(await fs.readFile(filePath, 'utf8')));
  } catch {
    return null;
  }
};

/**
 * The dbt adapter type of the project's active target: `profile:` in
 * dbt_project.yml → `<profile>.target` in the project-root profiles.yml →
 * `outputs.<target>.type`. A target that is a Jinja expression (or missing)
 * falls back to the first output. Null when any step is missing.
 */
export const readTargetAdapterType = async (
  projectPath: string,
): Promise<string | null> => {
  const dbtProject = await readYaml(path.join(projectPath, 'dbt_project.yml'));
  const profileName =
    typeof dbtProject?.profile === 'string' ? dbtProject.profile : null;
  if (!profileName) return null;

  const profiles = await readYaml(path.join(projectPath, 'profiles.yml'));
  const profile = asMap(profiles?.[profileName]);
  const outputs = asMap(profile?.outputs);
  if (!outputs) return null;

  const target = typeof profile?.target === 'string' ? profile.target : '';
  const output =
    asMap(outputs[target]) ?? asMap(Object.values(outputs)[0] ?? null);
  return typeof output?.type === 'string' ? output.type : null;
};
