import type { ExtensionMainModule } from '../../extensionApi/main';
import { pipelineManifest } from '../../extensions/pipeline/manifest.shared';
import { pipelineMain } from '../../extensions/pipeline/main';

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
];
