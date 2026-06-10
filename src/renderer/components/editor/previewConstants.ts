/**
 * Prefix used to identify virtual markdown preview tabs.
 * A preview tab path looks like: `__md_preview__:/absolute/path/to/file.md`
 *
 * Isolated here to avoid circular imports between the editor component
 * and the hooks layer (useTabManager).
 */
/** Prefix used to identify virtual markdown preview tabs. */
export const MD_PREVIEW_PREFIX = '__md_preview__:';

/** Prefix used to identify virtual HTML preview tabs. */
export const HTML_PREVIEW_PREFIX = '__html_preview__:';

/** Returns true if the path is a virtual preview tab path (Markdown or HTML). */
export const isVirtualPreviewPath = (path: string): boolean =>
  path.startsWith(MD_PREVIEW_PREFIX) || path.startsWith(HTML_PREVIEW_PREFIX);

/** Returns the source path for a preview tab path, or null if not a preview tab. */
export const getPreviewSourcePath = (path: string): string | null => {
  if (path.startsWith(MD_PREVIEW_PREFIX))
    return path.slice(MD_PREVIEW_PREFIX.length);
  if (path.startsWith(HTML_PREVIEW_PREFIX))
    return path.slice(HTML_PREVIEW_PREFIX.length);
  return null;
};

/** Returns the correct preview tab path for a given source file path. */
export const toPreviewPath = (sourcePath: string): string => {
  if (
    sourcePath.toLowerCase().endsWith('.html') ||
    sourcePath.toLowerCase().endsWith('.htm')
  ) {
    return `${HTML_PREVIEW_PREFIX}${sourcePath}`;
  }
  return `${MD_PREVIEW_PREFIX}${sourcePath}`;
};
