/**
 * Transitional. The runner's plugin manifest code and the requirement type
 * are still used by the pipeline tool's main-process code in Studio. They
 * move into src/extensions/pipeline/shared with the main half, and this
 * file is deleted then (docs/extensions/PLAN.md, phase 2). Not part of the
 * API offered to installed extensions.
 */
export * from '../../shared/pluginManifest';
export type { RunnerRequirementStatus } from '../../types/backend';
