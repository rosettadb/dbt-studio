import type { ExtensionRendererModule } from '../../extensionApi/renderer';
import { analyticsManifest } from '../../extensions/analytics/manifest.shared';
import { analyticsRenderer } from '../../extensions/analytics/renderer';
import { notebooksManifest } from '../../extensions/notebooks/manifest.shared';
import { notebooksRenderer } from '../../extensions/notebooks/renderer';
import { pipelineManifest } from '../../extensions/pipeline/manifest.shared';
import { pipelineRenderer } from '../../extensions/pipeline/renderer';
import { sqlManifest } from '../../extensions/sql/manifest.shared';
import { sqlRenderer } from '../../extensions/sql/renderer';

export interface BuiltinRendererExtension {
  /** The same manifest object the main-process list uses. */
  manifest: { publisher: string; name: string };
  /** Its UI half. */
  module: ExtensionRendererModule;
}

/**
 * The internal extensions compiled into the app, renderer side. This file
 * and `main/builtinExtensions.main.ts` are the only places outside
 * `src/extensions/` that import from it.
 */
export const builtinRendererExtensions: BuiltinRendererExtension[] = [
  { manifest: pipelineManifest, module: pipelineRenderer },
  { manifest: sqlManifest, module: sqlRenderer },
  { manifest: analyticsManifest, module: analyticsRenderer },
  { manifest: notebooksManifest, module: notebooksRenderer },
];
