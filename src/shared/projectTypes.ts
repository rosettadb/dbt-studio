import { canUseAsDbtConnection } from '../connections/registry.shared';
import type { ProjectType, ProjectTypeDefinition } from '../types/projectTypes';

/**
 * Project type definitions (plan 95a), used by main and renderer: labels,
 * capabilities, accepted connections and the New Project wizard's Include
 * items. Types are in src/types/projectTypes.ts.
 */

/** dbt Include item: the empty dbt folders (models, seeds, macros, ...). */
export const DBT_TEMPLATE_FOLDERS_ITEM = 'dbtFolders';

/**
 * Analytics Include items. The list and its defaults are a proposal waiting
 * on product (plan 95, Q1); the folders they create are in
 * main/services/projectTypes.service.ts.
 */
export const ANALYTICS_ITEMS = {
  readme: 'readme',
  notebooks: 'notebooks',
  queries: 'queries',
  analyticsPages: 'analyticsPages',
  data: 'data',
  pipelines: 'pipelines',
  gitignore: 'gitignore',
} as const;

const dbtProjectType: ProjectTypeDefinition = {
  id: 'dbt',
  label: 'dbt project',
  title: 'dbt Project',
  description:
    'Build, test and document data models with dbt Core, Rosetta layers and pipelines.',
  capabilities: {
    dbt: true,
    rosettaLayers: true,
    lineage: true,
    runHistory: true,
    pipelines: true,
    datalakeAsInstance: false,
  },
  acceptsConnection: canUseAsDbtConnection,
  templateItems: [
    {
      id: DBT_TEMPLATE_FOLDERS_ITEM,
      label: 'Template dbt directories',
      description: 'analysis, macros, models, seeds, snapshots and tests',
      defaultOn: true,
    },
  ],
};

const analyticsProjectType: ProjectTypeDefinition = {
  id: 'analytics',
  label: 'Analytics project',
  title: 'Analytics Project',
  description:
    'Explore and analyze data with notebooks and SQL on any connection.',
  capabilities: {
    dbt: false,
    rosettaLayers: false,
    lineage: false,
    runHistory: false,
    pipelines: true,
    // Linked to the DuckLake instance itself, as the SQL Editor and
    // Notebooks query it: a saved DuckLake connection can't run queries
    // outside dbt (plan 95, section 5).
    datalakeAsInstance: true,
  },
  // Notebooks and the SQL editor run on every connection type, including the
  // query-only ones a dbt project can't use.
  acceptsConnection: () => true,
  templateItems: [
    {
      id: ANALYTICS_ITEMS.readme,
      label: 'README',
      description: 'README.md with the project name, connection and folders',
      defaultOn: true,
    },
    {
      id: ANALYTICS_ITEMS.notebooks,
      label: 'Notebooks folder',
      description: 'notebooks/, for this project’s notebooks',
      defaultOn: true,
    },
    {
      id: ANALYTICS_ITEMS.queries,
      label: 'Queries folder',
      description: 'queries/, for .sql files',
      defaultOn: true,
    },
    {
      id: ANALYTICS_ITEMS.analyticsPages,
      label: 'Analytics pages folder',
      description: 'analytics/, for Analytics pages',
      defaultOn: true,
    },
    {
      id: ANALYTICS_ITEMS.data,
      label: 'Data folder',
      description: 'data/, for local CSV and Parquet files',
      defaultOn: true,
    },
    {
      id: ANALYTICS_ITEMS.pipelines,
      label: 'Pipelines folder',
      description: 'rosetta/pipelines/, for Rosetta pipelines',
      defaultOn: true,
    },
    {
      id: ANALYTICS_ITEMS.gitignore,
      label: '.gitignore',
      description: 'Ignores notebook checkpoints, caches and .env files',
      defaultOn: true,
    },
  ],
};

/** One definition per type. A missing key fails tsc. */
const definitions: { readonly [K in ProjectType]: ProjectTypeDefinition } = {
  dbt: dbtProjectType,
  analytics: analyticsProjectType,
};

/** Wizard order. */
const ORDER: ProjectType[] = ['dbt', 'analytics'];

export const DEFAULT_PROJECT_TYPE: ProjectType = 'dbt';

export function isProjectType(value: unknown): value is ProjectType {
  return typeof value === 'string' && value in definitions;
}

/** The project's type; projects saved before plan 95a have none and are dbt. */
export function getProjectType(
  project?: { type?: ProjectType | string } | null,
): ProjectType {
  const type = project?.type;
  return isProjectType(type) ? type : DEFAULT_PROJECT_TYPE;
}

export function getProjectTypeDefinition(
  type: ProjectType,
): ProjectTypeDefinition {
  return definitions[type] ?? definitions[DEFAULT_PROJECT_TYPE];
}

/** Shorthand for getProjectTypeDefinition(getProjectType(project)). */
export function projectTypeOf(
  project?: { type?: ProjectType | string } | null,
): ProjectTypeDefinition {
  return getProjectTypeDefinition(getProjectType(project));
}

export function listProjectTypes(): ProjectTypeDefinition[] {
  return ORDER.map((type) => definitions[type]);
}

/** The Include items that are on when the wizard opens for this type. */
export function defaultTemplateItems(type: ProjectType): string[] {
  return getProjectTypeDefinition(type)
    .templateItems.filter((item) => item.defaultOn)
    .map((item) => item.id);
}
