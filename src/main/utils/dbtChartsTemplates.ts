import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';
import type { DbtChartsSetupResult } from '../../types/backend';

export const DBT_CHARTS_CONFIG_FILE = 'dbt_charts.yml';
export const DBT_CHARTS_DIR = 'charts';
export const DBT_CHARTS_INDEX_FILE = path.join(DBT_CHARTS_DIR, 'index.yml');

const DEFAULT_SOURCE_NAME = 'warehouse';

// Starter content shared by the index board and new boards (shape recorded
// from dbt-charts 0.9.1: inline `values` rows, charts, then one layout key).
// Inline rows render before any warehouse is connected; replace the query with
// `sql:` plus `source: <name>` to read real tables.
const starterBoard = (sourceName: string, title: string) => ({
  // Default source for `sql:` queries. Must match a name under `sources:` in
  // dbt_charts.yml (the inline `values:` query below does not need it).
  source: sourceName,
  title,
  queries: {
    sample: {
      type: 'values',
      columns: ['month', 'orders'],
      values: [
        ['2024-01-01', 120],
        ['2024-02-01', 150],
        ['2024-03-01', 180],
      ],
    },
  },
  charts: {
    orders_by_month: {
      type: 'bar',
      query: 'sample',
      x: 'month',
      y: 'orders',
    },
  },
  rows: ['orders_by_month'],
});

export function slugifyBoardName(segment: string): string {
  return segment
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildConfigYml(sourceName: string, profile: string): string {
  // `sources:` is a map keyed by source name.
  return yaml.dump(
    {
      sources: {
        [sourceName]: { type: 'dbt_profile', profile, target: 'dev' },
      },
    },
    { lineWidth: 120 },
  );
}

export function buildBoardYml(sourceName: string, title: string): string {
  return yaml.dump(starterBoard(sourceName, title), { lineWidth: 120 });
}

type DbtProjectYml = { name?: string; profile?: string };

export async function readDbtProjectYml(
  projectPath: string,
): Promise<DbtProjectYml> {
  const file = path.join(projectPath, 'dbt_project.yml');
  if (!(await fs.pathExists(file))) {
    throw new Error('dbt_project.yml not found in the project root');
  }
  const parsed = yaml.load(await fs.readFile(file, 'utf8')) as
    | DbtProjectYml
    | undefined;
  return parsed ?? {};
}

export function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Writes dbt_charts.yml and charts/index.yml. Refuses if either exists so a
 * user's hand-written config is never overwritten.
 */
export async function setupDbtChartsProject(
  projectPath: string,
  projectName: string,
): Promise<DbtChartsSetupResult> {
  const configPath = path.join(projectPath, DBT_CHARTS_CONFIG_FILE);
  const indexPath = path.join(projectPath, DBT_CHARTS_INDEX_FILE);

  if ((await fs.pathExists(configPath)) || (await fs.pathExists(indexPath))) {
    throw new Error(
      `dbt Charts is already set up (${DBT_CHARTS_CONFIG_FILE} or ${DBT_CHARTS_INDEX_FILE} exists)`,
    );
  }

  const dbtProject = await readDbtProjectYml(projectPath);
  const profile = dbtProject.profile?.trim();
  if (!profile) {
    throw new Error('dbt_project.yml has no "profile" entry');
  }
  // Underscores, like dbt names, so the name is easy to type in `source:`.
  const sourceName =
    slugifyBoardName(projectName).replace(/-/g, '_') || DEFAULT_SOURCE_NAME;

  await fs.mkdirp(path.dirname(indexPath));
  await fs.writeFile(configPath, buildConfigYml(sourceName, profile), 'utf8');
  await fs.writeFile(indexPath, buildBoardYml(sourceName, projectName), 'utf8');
  return { configPath, indexPath };
}

/** Reads the source name from dbt_charts.yml (first source). */
export async function readSourceName(projectPath: string): Promise<string> {
  const configPath = path.join(projectPath, DBT_CHARTS_CONFIG_FILE);
  if (!(await fs.pathExists(configPath))) {
    throw new Error('dbt Charts is not set up for this project yet');
  }
  const parsed = yaml.load(await fs.readFile(configPath, 'utf8')) as
    | { sources?: Record<string, unknown> }
    | undefined;
  return Object.keys(parsed?.sources ?? {})[0] ?? DEFAULT_SOURCE_NAME;
}

/**
 * Creates charts/{slug}.yml (nested names such as "team/sales" are allowed).
 * Refuses existing files and anything resolving outside charts/.
 */
export async function createDbtChartsBoard(
  projectPath: string,
  name: string,
): Promise<{ path: string }> {
  const rawSegments = (name ?? '').replace(/\\/g, '/').split('/');
  if (
    rawSegments.some((s) => s.trim() === '..' || s.trim() === '.') ||
    (name ?? '').startsWith('/')
  ) {
    throw new Error('Board name must stay inside the charts folder');
  }
  const segments = rawSegments.map(slugifyBoardName).filter(Boolean);
  if (segments.length === 0) {
    throw new Error('Board name is required');
  }

  const chartsDir = path.resolve(projectPath, DBT_CHARTS_DIR);
  const target = path.resolve(chartsDir, `${segments.join('/')}.yml`);
  if (!isInside(chartsDir, target)) {
    throw new Error('Board name must stay inside the charts folder');
  }
  if (await fs.pathExists(target)) {
    throw new Error(
      `Board already exists: ${path.relative(projectPath, target)}`,
    );
  }

  const sourceName = await readSourceName(projectPath);
  await fs.mkdirp(path.dirname(target));
  await fs.writeFile(
    target,
    buildBoardYml(sourceName, (name ?? '').trim() || segments.join('/')),
    'utf8',
  );
  return { path: target };
}

/** Board files (relative to the project root), sorted, index first. */
export async function listDbtChartsBoards(
  projectPath: string,
): Promise<string[]> {
  const chartsDir = path.join(projectPath, DBT_CHARTS_DIR);
  if (!(await fs.pathExists(chartsDir))) return [];
  const out: string[] = [];
  const walk = async (dir: string) => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (/\.ya?ml$/i.test(entry.name)) {
          out.push(path.relative(projectPath, full).split(path.sep).join('/'));
        }
      }),
    );
  };
  await walk(chartsDir);
  return out.sort((a, b) => a.localeCompare(b));
}
