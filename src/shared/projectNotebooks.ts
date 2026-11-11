/**
 * Notebooks saved inside a project folder (plan 95c). Shared by main and
 * renderer.
 */

/** Folder, relative to the project root, that holds the project's notebooks. */
export const PROJECT_NOTEBOOKS_DIR = 'notebooks';

/** Ids of project notebooks look like `pnb_<projectId>_<12 hex>`. */
export const PROJECT_NOTEBOOK_ID_PREFIX = 'pnb_';

export const isProjectNotebookId = (notebookId: string): boolean =>
  notebookId.startsWith(PROJECT_NOTEBOOK_ID_PREFIX);
