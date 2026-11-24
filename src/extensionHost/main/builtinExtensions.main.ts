import type { ExtensionMainModule } from '../../extensionApi/main';
import { analyticsManifest } from '../../extensions/analytics/manifest.shared';
import { analyticsMain } from '../../extensions/analytics/main';
import { pipelineManifest } from '../../extensions/pipeline/manifest.shared';
import { pipelineMain } from '../../extensions/pipeline/main';
import { sqlManifest } from '../../extensions/sql/manifest.shared';
import { sqlMain } from '../../extensions/sql/main';

export interface BuiltinMainExtension {
  /** The extension's manifest object (validated by the host). */
  manifest: unknown;
  /** Its main half. Absent when the extension only has a UI half. */
  module?: ExtensionMainModule;
}

/**
 * The internal extensions compiled into the app, main-process side. This
 * file and `renderer/builtinExtensions.renderer.ts` are the only places
 * outside `src/extensions/` that import from it.
 */
export const builtinMainExtensions: BuiltinMainExtension[] = [
  { manifest: pipelineManifest, module: pipelineMain },
  { manifest: sqlManifest, module: sqlMain },
  { manifest: analyticsManifest, module: analyticsMain },
];
