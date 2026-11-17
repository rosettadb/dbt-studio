import type { ProjectTypeDefinition } from '../registry.shared';

/**
 * Include items for a new Analytics project. The list and its defaults are a
 * proposal waiting on product (plan 95, Q1); changing them only touches this
 * file and analytics.main.ts.
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

export const analyticsProjectType: ProjectTypeDefinition = {
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
