/**
 * Prefix used to identify virtual markdown preview tabs.
 * A preview tab path looks like: `__md_preview__:/absolute/path/to/file.md`
 *
 * Isolated here to avoid circular imports between the editor component
 * and the hooks layer (useTabManager).
 */
export const PREVIEW_PATH_PREFIX = '__md_preview__:';

/** Returns the source path for a preview tab path, or null if not a preview tab. */
export const getPreviewSourcePath = (path: string): string | null =>
  path.startsWith(PREVIEW_PATH_PREFIX)
    ? path.slice(PREVIEW_PATH_PREFIX.length)
    : null;

/** Returns the preview tab path for a given source file path. */
export const toPreviewPath = (sourcePath: string): string =>
  `${PREVIEW_PATH_PREFIX}${sourcePath}`;
