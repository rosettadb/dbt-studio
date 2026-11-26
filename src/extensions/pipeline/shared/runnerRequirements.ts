import type { RequirementWithPlugins } from './pluginManifest';

// A tool the runner's plugins need (from the plugin manifest's `requires`)
// and whether it is installed on this machine.
export type RunnerRequirementStatus = RequirementWithPlugins & {
  available: boolean;
  /** Found, possibly older than check.minVersion (then available is false). */
  version?: string;
  path?: string;
  /** Installed by Studio itself (its own installer or its own Python). */
  managedInStudio?: boolean;
};
