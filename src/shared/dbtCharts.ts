/**
 * Pure helpers shared by the main process and the renderer for dbt Charts.
 */

/**
 * Maps a board file to the URL path dct serves it at:
 * charts/index.yml -> /, charts/sales.yml -> /sales/,
 * charts/a/index.yml -> /a/, charts/a/b.yml -> /a/b/.
 */
export function boardUrlPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\.?\/+/, '');
  const withoutRoot = normalized.replace(/^charts\//, '');
  const withoutExt = withoutRoot.replace(/\.ya?ml$/i, '');
  const segments = withoutExt.split('/').filter(Boolean);
  if (segments[segments.length - 1] === 'index') segments.pop();
  return segments.length === 0 ? '/' : `/${segments.join('/')}/`;
}
