import fs from 'fs-extra';
import path from 'path';
import SettingsService from '../../../extensionApi/studioMain/settingsService';
import {
  parsePluginManifest,
  type PluginDefinition,
} from '../shared/pluginManifest';

let lastLoaded: PluginDefinition[] = [];

/**
 * Reads the plugin manifest that ships with the local runner
 * (<runnerHome>/plugins.json). Without a runner, or with an unreadable
 * manifest, there are no plugins.
 */
export async function loadPluginDefinitions(): Promise<PluginDefinition[]> {
  try {
    const settings = await SettingsService.loadSettings();
    lastLoaded = settings.runnerHome
      ? parsePluginManifest(
          await fs.readJson(path.join(settings.runnerHome, 'plugins.json')),
        )
      : [];
  } catch {
    lastLoaded = [];
  }
  return lastLoaded;
}

/** The result of the last loadPluginDefinitions call, for code that cannot wait. */
export function getPluginDefinitions(): PluginDefinition[] {
  return lastLoaded;
}

/**
 * Values for the macros a widget default may hold, for one project: where
 * its dbt and Rosetta folders are, relative to the project folder (which is
 * the runner's working folder). Empty means the project folder itself or
 * not found.
 */
export async function resolveProjectMacroDirs(
  projectPath: string,
): Promise<{ dbtDir: string; rosettaDir: string }> {
  const exists = (...segments: string[]) =>
    fs.pathExists(path.join(projectPath, ...segments));

  let dbtDir = '';
  try {
    if (!(await exists('dbt_project.yml'))) {
      const entries = await fs.readdir(projectPath, { withFileTypes: true });
      const folders = entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => entry.name)
        .sort();
      const hasProject = await Promise.all(
        folders.map((folder) => exists(folder, 'dbt_project.yml')),
      );
      dbtDir = folders.find((_, index) => hasProject[index]) ?? '';
    }
  } catch {
    dbtDir = '';
  }

  let rosettaDir = '';
  try {
    rosettaDir = (await exists('rosetta')) ? 'rosetta' : '';
  } catch {
    rosettaDir = '';
  }
  return { dbtDir, rosettaDir };
}
