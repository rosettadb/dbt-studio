import fs from 'fs';
import path from 'path';
import ConnectorsService from '../../main/services/connectors.service';
import DuckLakeService from '../../main/services/duckLake.service';
import { duckLakeInstanceIdOf } from '../../shared/duckLakeInstanceIds';
import type { ProjectTypeMain } from '../registry.shared';
import { ANALYTICS_ITEMS } from './analytics.shared';

/** Folders the Include items create, in README order. */
const FOLDERS: Array<{ item: string; folder: string; readme: string }> = [
  {
    item: ANALYTICS_ITEMS.notebooks,
    folder: 'notebooks',
    readme: '- `notebooks/`: notebooks',
  },
  {
    item: ANALYTICS_ITEMS.queries,
    folder: 'queries',
    readme: '- `queries/`: SQL queries (`.sql` files)',
  },
  {
    item: ANALYTICS_ITEMS.analyticsPages,
    folder: 'analytics',
    readme: '- `analytics/`: Analytics pages',
  },
  {
    item: ANALYTICS_ITEMS.data,
    folder: 'data',
    readme: '- `data/`: local CSV and Parquet files',
  },
  {
    item: ANALYTICS_ITEMS.pipelines,
    folder: path.join('rosetta', 'pipelines'),
    readme: '- `rosetta/pipelines/`: Rosetta pipelines',
  },
];

const GITIGNORE = [
  '# Notebook and Python caches',
  '.ipynb_checkpoints/',
  '__pycache__/',
  '',
  '# Local secrets and OS files',
  '.env',
  '.DS_Store',
  '',
].join('\n');

/**
 * Name and type of the project connection for the README: a saved
 * connection, or a DuckLake instance linked directly (`ducklake-<id>`).
 * No secrets.
 */
const connectionLabel = async (
  connectionId?: string,
): Promise<{ name: string; type: string } | undefined> => {
  if (!connectionId) return undefined;
  const instanceId = duckLakeInstanceIdOf(connectionId);
  if (instanceId) {
    const instance = await DuckLakeService.getInstance(instanceId).catch(
      () => undefined,
    );
    return instance?.name
      ? { name: instance.name, type: 'DuckLake' }
      : undefined;
  }
  const saved = await ConnectorsService.getConnectionById(connectionId);
  return saved
    ? { name: saved.connection.name, type: saved.connection.type }
    : undefined;
};

const readmeFile = (
  name: string,
  include: string[],
  connection?: { name: string; type: string },
): string => {
  const folders = FOLDERS.filter(({ item }) => include.includes(item)).map(
    ({ readme }) => readme,
  );
  return [
    `# ${name}`,
    '',
    'An Analytics project created with Rosetta DBT Studio.',
    '',
    '## Connection',
    '',
    connection
      ? `This project uses the **${connection.name}** (${connection.type}) connection. Credentials stay in Studio, not in this folder.`
      : 'No connection yet. Add one from the project’s Database tab.',
    '',
    ...(folders.length > 0 ? ['## Folders', '', ...folders, ''] : []),
  ].join('\n');
};

const writeFile = (filePath: string, content: string) =>
  fs.promises.writeFile(filePath, content, 'utf8');

/**
 * Analytics projects hold no dbt files: no dbt_project.yml, profiles.yml or
 * rosetta/main.conf, and no marker file (the type is stored in Studio). The
 * project connection is used from main through ConnectorsService, so
 * attaching one writes nothing into the folder.
 */
export const analyticsProjectTypeMain: ProjectTypeMain = {
  async scaffold({ projectPath, name, include, connectionId }) {
    await fs.promises.mkdir(projectPath, { recursive: true });

    if (include.includes(ANALYTICS_ITEMS.readme)) {
      await writeFile(
        path.join(projectPath, 'README.md'),
        readmeFile(name, include, await connectionLabel(connectionId)),
      );
    }
    // Git doesn't keep empty folders, so each one gets a .gitkeep
    await Promise.all(
      FOLDERS.filter(({ item }) => include.includes(item)).map(
        async ({ folder }) => {
          const folderPath = path.join(projectPath, folder);
          await fs.promises.mkdir(folderPath, { recursive: true });
          await writeFile(path.join(folderPath, '.gitkeep'), '');
        },
      ),
    );
    if (include.includes(ANALYTICS_ITEMS.gitignore)) {
      await writeFile(path.join(projectPath, '.gitignore'), GITIGNORE);
    }
  },

  async onConnectionChanged() {
    // Nothing to write: no profiles.yml, no main.conf.
  },

  async readConnectionFiles() {
    return {};
  },

  async detectRoot(folder) {
    // The fallback: any folder that isn't a project of another type
    return folder;
  },
};
