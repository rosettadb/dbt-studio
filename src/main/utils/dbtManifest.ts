import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';

type PathConfig = {
  'model-paths'?: string[];
  'macro-paths'?: string[];
  'seed-paths'?: string[];
  'snapshot-paths'?: string[];
};

const DEFAULT_PATHS: Required<PathConfig> = {
  'model-paths': ['models'],
  'macro-paths': ['macros'],
  'seed-paths': ['seeds'],
  'snapshot-paths': ['snapshots'],
};

async function newestMtime(target: string): Promise<number> {
  let stat;
  try {
    stat = await fs.stat(target);
  } catch {
    return 0;
  }
  if (!stat.isDirectory()) return stat.mtimeMs;
  const entries = await fs.readdir(target);
  const times = await Promise.all(
    entries.map((entry) => newestMtime(path.join(target, entry))),
  );
  // Files only: a directory's own mtime also moves on unrelated churn.
  return Math.max(0, ...times);
}

async function readSourcePaths(projectPath: string): Promise<string[]> {
  let config: PathConfig = {};
  try {
    const raw = await fs.readFile(
      path.join(projectPath, 'dbt_project.yml'),
      'utf8',
    );
    config = (yaml.load(raw) as PathConfig | undefined) ?? {};
  } catch {
    config = {};
  }
  const keys = Object.keys(DEFAULT_PATHS) as (keyof PathConfig)[];
  return keys.flatMap((key) => {
    const configured = config[key];
    return Array.isArray(configured) && configured.length > 0
      ? configured
      : DEFAULT_PATHS[key];
  });
}

/**
 * True when target/manifest.json is missing, or older than dbt_project.yml or
 * any file under the project's model, macro, seed and snapshot paths.
 */
export async function isManifestStale(projectPath: string): Promise<boolean> {
  const manifestPath = path.join(projectPath, 'target', 'manifest.json');
  let manifestMtime: number;
  try {
    manifestMtime = (await fs.stat(manifestPath)).mtimeMs;
  } catch {
    return true;
  }

  const sources = [
    path.join(projectPath, 'dbt_project.yml'),
    ...(await readSourcePaths(projectPath)).map((p) =>
      path.resolve(projectPath, p),
    ),
  ];
  const newest = Math.max(...(await Promise.all(sources.map(newestMtime))));
  return newest > manifestMtime;
}
