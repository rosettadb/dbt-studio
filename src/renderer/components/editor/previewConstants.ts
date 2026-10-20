/**
 * Prefix used to identify virtual markdown preview tabs.
 * A preview tab path looks like: `__md_preview__:/absolute/path/to/file.md`
 *
 * Isolated here to avoid circular imports between the editor component
 * and the hooks layer (useTabManager).
 */
export const MD_PREVIEW_PREFIX = '__md_preview__:';

/** Returns true if the path is a virtual preview tab path (Markdown). */
export const isVirtualPreviewPath = (path: string): boolean =>
  path.startsWith(MD_PREVIEW_PREFIX);

/** Returns the source path for a preview tab path, or null if not a preview tab. */
export const getPreviewSourcePath = (path: string): string | null =>
  path.startsWith(MD_PREVIEW_PREFIX)
    ? path.slice(MD_PREVIEW_PREFIX.length)
    : null;

/** Returns the preview tab path for a given source file path. */
export const toPreviewPath = (sourcePath: string): string =>
  `${MD_PREVIEW_PREFIX}${sourcePath}`;
