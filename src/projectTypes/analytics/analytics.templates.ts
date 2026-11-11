import { PROJECT_MARKER_FILE } from '../core/types.shared';
import { ANALYTICS_ITEMS } from './analytics.shared';

/**
 * File contents for a new Analytics project. Proposal waiting on product
 * (plan 95, Q1). Nothing here may contain a credential: the project
 * connection lives in database.json + keytar, never in the folder.
 */

export const markerFile = (name: string): string =>
  [
    '# Created by Rosetta DBT Studio. Marks this folder as an Analytics project.',
    'version: 1',
    'type: analytics',
    `name: ${name}`,
    '',
  ].join('\n');

export const gitignoreFile = (): string =>
  [
    '# Notebook and Python caches',
    '.ipynb_checkpoints/',
    '__pycache__/',
    '',
    '# Local secrets and OS files',
    '.env',
    '.DS_Store',
    '',
  ].join('\n');

export const sqlScratchFile = (): string =>
  [
    '-- SQL files in this folder run against the project connection.',
    '-- Write a query and use the Run code lens above it.',
    '',
  ].join('\n');

const FOLDER_LINES: Array<[string, string]> = [
  [ANALYTICS_ITEMS.notebooks, '- `notebooks/`: Python and SQL notebooks'],
  [ANALYTICS_ITEMS.sql, '- `sql/`: SQL files run against the connection'],
  [ANALYTICS_ITEMS.data, '- `data/`: local CSV and Parquet files'],
  [ANALYTICS_ITEMS.pipelines, '- `rosetta/pipelines/`: Rosetta pipelines'],
];

export const readmeFile = (
  name: string,
  include: string[],
  connection?: { name: string; type: string },
): string => {
  const folders = FOLDER_LINES.filter(([id]) => include.includes(id)).map(
    ([, line]) => line,
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
    `\`${PROJECT_MARKER_FILE}\` tells Studio this folder is an Analytics project. Keep it in Git.`,
    '',
  ].join('\n');
};

/** Cells of notebooks/getting_started.ipynb (written through the notebooks service). */
export const starterNotebookCells = (connectionName?: string) => [
  {
    cell_type: 'markdown' as const,
    source: [
      '# Getting started',
      '',
      connectionName
        ? `SQL cells run on **${connectionName}**, the project connection. Results land in a pandas DataFrame named \`df\` that Python cells can use.`
        : 'Pick a connection in the Notebooks screen, then run the SQL cell. Results land in a pandas DataFrame named `df`.',
    ].join('\n'),
  },
  {
    cell_type: 'sql' as const,
    source: '-- Write a query, then run the cell\n',
  },
  {
    cell_type: 'code' as const,
    source: 'df.head()',
  },
];
