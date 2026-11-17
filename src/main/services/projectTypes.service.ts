import fs from 'fs';
import path from 'path';
import type { Project } from '../../types/backend';
import type {
  ProjectType,
  ProjectTypeMain,
  ScaffoldInput,
} from '../../types/projectTypes';
import {
  ANALYTICS_ITEMS,
  DBT_TEMPLATE_FOLDERS_ITEM,
  getProjectType,
} from '../../shared/projectTypes';
import { duckLakeInstanceIdOf } from '../../shared/duckLakeInstanceIds';
import ProjectsService from './projects.service';
import ConnectorsService from './connectors.service';
import DuckLakeService from './duckLake.service';

// --- dbt -------------------------------------------------------------------

/**
 * dbt projects do exactly what Studio did before project types existed: the
 * hooks call the same ProjectsService / ConnectorsService code, in the same
 * order, so a dbt project's files don't change.
 */
const dbtMain: ProjectTypeMain = {
  async scaffold({ projectPath, name, include }) {
    await ProjectsService.copyDbtTemplateFiles(projectPath, name);
    // Always copy main.conf (Rosetta requires it); profiles.yml is generated
    // once a connection is configured.
    await ProjectsService.copyRosettaMainConf(projectPath);
    if (include.includes(DBT_TEMPLATE_FOLDERS_ITEM)) {
      await ProjectsService.createDbtTemplateFolderStructure(projectPath);
    }
  },

  async onConnectionChanged(project) {
    await ConnectorsService.loadConfigurations(project.id);
  },

  async readConnectionFiles(project) {
    // Populate rosettaConnection and dbtConnection without regenerating files
    const parsed = await ConnectorsService.parseProjectConnectionFiles(
      project.path,
    );
    return {
      rosettaConnection: parsed.rosettaConnection,
      dbtConnection: parsed.dbtConnection,
    };
  },

  async detectRoot(folder) {
    // The same search import has always used: dbt_project.yml at the root
    // or in a subfolder
    return ProjectsService.findDbtProjectRoot(folder);
  },
};

// --- Analytics -------------------------------------------------------------

/** Folders the Analytics Include items create, in README order. */
const ANALYTICS_FOLDERS: Array<{
  item: string;
  folder: string;
  readme: string;
}> = [
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

const ANALYTICS_GITIGNORE = [
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

const analyticsReadme = (
  name: string,
  include: string[],
  connection?: { name: string; type: string },
): string => {
  const folders = ANALYTICS_FOLDERS.filter(({ item }) =>
    include.includes(item),
  ).map(({ readme }) => readme);
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
const analyticsMain: ProjectTypeMain = {
  async scaffold({ projectPath, name, include, connectionId }) {
    await fs.promises.mkdir(projectPath, { recursive: true });

    if (include.includes(ANALYTICS_ITEMS.readme)) {
      await writeFile(
        path.join(projectPath, 'README.md'),
        analyticsReadme(name, include, await connectionLabel(connectionId)),
      );
    }
    // Git doesn't keep empty folders, so each one gets a .gitkeep
    await Promise.all(
      ANALYTICS_FOLDERS.filter(({ item }) => include.includes(item)).map(
        async ({ folder }) => {
          const folderPath = path.join(projectPath, folder);
          await fs.promises.mkdir(folderPath, { recursive: true });
          await writeFile(path.join(folderPath, '.gitkeep'), '');
        },
      ),
    );
    if (include.includes(ANALYTICS_ITEMS.gitignore)) {
      await writeFile(
        path.join(projectPath, '.gitignore'),
        ANALYTICS_GITIGNORE,
      );
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

// --- Service ---------------------------------------------------------------

/** One implementation per type. A missing key fails tsc. */
const typeMains: { readonly [K in ProjectType]: ProjectTypeMain } = {
  dbt: dbtMain,
  analytics: analyticsMain,
};

/**
 * Order in which clone and import try the types. The first one that finds a
 * root wins. Analytics accepts any folder, so it must stay last.
 */
const DETECT_ORDER: ProjectType[] = ['dbt', 'analytics'];

/**
 * What differs between project types in the main process (plan 95a).
 * ProjectsService calls it on create, read, connection change, clone and
 * import; it picks the dbt or Analytics behaviour from the project's type.
 */
export default class ProjectTypesService {
  /** Write a new project's files. Runs before the project is saved. */
  static async scaffold(type: ProjectType, input: ScaffoldInput) {
    await typeMains[type].scaffold(input);
  }

  /** The project connection was set or changed (dbt: profiles.yml). */
  static async onConnectionChanged(project: Project) {
    await typeMains[getProjectType(project)].onConnectionChanged(project);
  }

  /** Fields read from the project's own config files on every read. */
  static async readConnectionFiles(
    project: Project,
  ): Promise<Partial<Project>> {
    return typeMains[getProjectType(project)].readConnectionFiles(project);
  }

  /**
   * The type of an existing folder (clone, import) and the project root in
   * it: a folder with dbt_project.yml (at the root or below) is dbt, any
   * other folder is Analytics. Projects have no marker file (plan 95a, D1).
   */
  static async detectType(
    folder: string,
  ): Promise<{ type: ProjectType; root: string }> {
    const roots = await Promise.all(
      DETECT_ORDER.map((type) => typeMains[type].detectRoot(folder)),
    );
    const index = roots.findIndex((root) => !!root);
    return index === -1
      ? { type: DETECT_ORDER[DETECT_ORDER.length - 1], root: folder }
      : { type: DETECT_ORDER[index], root: roots[index] as string };
  }
}
