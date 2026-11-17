/**
 * Saved queries and Analytics pages kept in a project folder (plan 95d).
 * Shared by main and renderer.
 *
 * - Queries: one plain `.sql` file per query under `<project>/queries/`.
 * - Analytics pages: one Markdown file per page under `<project>/analytics/`.
 *   The route comes from the file path, as in Evidence:
 *   `index.md` → `/`, `sales/monthly.md` → `/sales/monthly`,
 *   `sales/index.md` → `/sales`. The title is the frontmatter `title`.
 *
 * The project is the one linked to the active connection, as for notebooks.
 */

export const PROJECT_QUERIES_DIR = 'queries';
export const PROJECT_ANALYTICS_DIR = 'analytics';

/** Where a new query or page is saved. */
export type SaveLocation = 'project' | 'studio';

/** Ids of project pages: `pap:<projectId>:<path relative to analytics/>`. */
const PAGE_ID_PREFIX = 'pap:';

export const projectPageId = (projectId: string, relativePath: string) =>
  `${PAGE_ID_PREFIX}${projectId}:${relativePath}`;

export const isProjectPageId = (pageId: string): boolean =>
  pageId.startsWith(PAGE_ID_PREFIX);

export function parseProjectPageId(
  pageId: string,
): { projectId: string; relativePath: string } | null {
  if (!isProjectPageId(pageId)) return null;
  const rest = pageId.slice(PAGE_ID_PREFIX.length);
  const separator = rest.indexOf(':');
  if (separator <= 0) return null;
  const projectId = rest.slice(0, separator);
  const relativePath = rest.slice(separator + 1);
  if (!relativePath.endsWith('.md')) return null;
  return { projectId, relativePath };
}

/** `sales/monthly.md` → `/sales/monthly`; `index.md` → `/`. */
export function routeFromPagePath(relativePath: string): string {
  const segments = relativePath.replace(/\.md$/i, '').split('/');
  if (segments[segments.length - 1] === 'index') segments.pop();
  return `/${segments.filter(Boolean).join('/')}`;
}

/** `/sales/monthly` → `sales/monthly.md`; `/` → `index.md`. */
export function pagePathFromRoute(routePath: string): string {
  const segments = routePath
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.some((segment) => segment === '..' || segment === '.')) {
    throw new Error(`Invalid route: "${routePath}"`);
  }
  return segments.length === 0 ? 'index.md' : `${segments.join('/')}.md`;
}

/** `Top customers` → `top_customers` (file names for new queries). */
export const queryFileStem = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'query';
