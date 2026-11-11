import type { ProjectTypeDefinition } from '../core/types.shared';

/**
 * Include items for a new Analytics project. The list and its defaults are a
 * proposal waiting on product (plan 95, Q1); changing them only touches this
 * file and analytics.templates.ts.
 */
export const ANALYTICS_ITEMS = {
  readme: 'readme',
  notebooks: 'notebooks',
  starterNotebook: 'starterNotebook',
  sql: 'sql',
  data: 'data',
  pipelines: 'pipelines',
  gitignore: 'gitignore',
} as const;

export const analyticsProjectType: ProjectTypeDefinition = {
  id: 'analytics',
  label: 'Analytics project',
  title: 'Analytics Project',
  shortTitle: 'Analytics',
  description:
    'Explore and analyze data with notebooks and SQL on any connection. No dbt.',
  capabilities: {
    dbt: false,
    rosettaLayers: false,
    lineage: false,
    runHistory: false,
    pipelines: true,
    // A saved ducklake connection is only tested through the dbt path; the
    // notebooks reach DuckLake instances directly (plan 95, section 5).
    datalakeConnections: false,
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
      description: 'notebooks/, where Studio saves this project’s notebooks',
      defaultOn: true,
    },
    {
      id: ANALYTICS_ITEMS.starterNotebook,
      label: 'Starter notebook',
      description: 'notebooks/getting_started.ipynb with a SQL cell',
      defaultOn: true,
      requires: ANALYTICS_ITEMS.notebooks,
    },
    {
      id: ANALYTICS_ITEMS.sql,
      label: 'SQL folder',
      description: 'sql/, for .sql files you run against the connection',
      defaultOn: true,
    },
    {
      id: ANALYTICS_ITEMS.data,
      label: 'Data folder',
      description: 'data/, for local CSV and Parquet files',
      defaultOn: false,
    },
    {
      id: ANALYTICS_ITEMS.pipelines,
      label: 'Pipelines folder',
      description: 'rosetta/pipelines/, for Rosetta pipelines',
      defaultOn: false,
    },
    {
      id: ANALYTICS_ITEMS.gitignore,
      label: '.gitignore',
      description: 'Ignores notebook checkpoints, caches and .env files',
      defaultOn: true,
    },
  ],
};
