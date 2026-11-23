/**
 * Transitional. The runner's plugin manifest code is still used by the
 * pipeline AI tools in Studio's agent code. It moves into
 * src/extensions/pipeline with those tools, and this file is deleted then
 * (docs/extensions/PLAN.md, phase 2, task 2.9).
 */
export * from '../../shared/pluginManifest';
export {
  getPluginDefinitions,
  loadPluginDefinitions,
  resolveProjectMacroDirs,
} from '../../main/services/pluginManifest.service';
export type { RunnerRequirementStatus } from '../../types/backend';
