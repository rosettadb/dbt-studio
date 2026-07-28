import { isPipelineFile } from '../../../shared/pipelines/pipelineConfig';

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

/**
 * Prefix used to identify virtual pipeline view tabs.
 * A pipeline tab path looks like: `__pipeline__:/absolute/path/to/pipeline.yml`
 */
export const PIPELINE_TAB_PREFIX = '__pipeline__:';

/** Returns true if the path is a virtual pipeline view tab. */
export const isPipelineTabPath = (path: string): boolean =>
  path.startsWith(PIPELINE_TAB_PREFIX);

/** Returns the real file path for a pipeline tab, or null if not a pipeline tab. */
export const getPipelineFilePath = (path: string): string | null =>
  path.startsWith(PIPELINE_TAB_PREFIX)
    ? path.slice(PIPELINE_TAB_PREFIX.length)
    : null;

/** Returns the pipeline tab path for a given pipeline file path. */
export const toPipelineTabPath = (filePath: string): string =>
  `${PIPELINE_TAB_PREFIX}${filePath}`;

/**
 * Returns the one canonical tab path for a file. Pipeline YAML always maps to
 * its virtual Pipeline Editor tab so callers cannot also open a Monaco tab for
 * the same disk file.
 */
export const toCanonicalEditorTabPath = (filePath: string): string =>
  !isPipelineTabPath(filePath) && isPipelineFile(filePath)
    ? toPipelineTabPath(filePath)
    : filePath;
