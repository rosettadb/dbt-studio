import fs from 'fs';
import path from 'path';
import ConnectorsService from '../../main/services/connectors.service';
import PythonNotebooksService from '../../main/services/pythonNotebooks.service';
import { RECOMMENDED_PYTHON_VERSION } from '../../main/services/settings.service';
import { PROJECT_NOTEBOOKS_DIR } from '../../shared/projectNotebooks';
import { PROJECT_MARKER_FILE } from '../core/types.shared';
import type { ProjectTypeMain } from '../core/types.main';
import { ANALYTICS_ITEMS } from './analytics.shared';
import {
  gitignoreFile,
  markerFile,
  readmeFile,
  sqlScratchFile,
  starterNotebookCells,
} from './analytics.templates';

const writeFile = (filePath: string, content: string) =>
  fs.promises.writeFile(filePath, content, 'utf8');

// Git doesn't keep empty folders, so empty ones get a .gitkeep.
const makeFolder = async (folderPath: string, keep: boolean) => {
  await fs.promises.mkdir(folderPath, { recursive: true });
  if (keep) await writeFile(path.join(folderPath, '.gitkeep'), '');
};

/**
 * Analytics projects hold no dbt files: no dbt_project.yml, profiles.yml or
 * rosetta/main.conf. The project connection is used from main through
 * ConnectorsService, so attaching one writes nothing into the folder.
 */
export const analyticsProjectTypeMain: ProjectTypeMain = {
  async scaffold({ projectPath, name, include, connection }) {
    const has = (id: string) => include.includes(id);
    await fs.promises.mkdir(projectPath, { recursive: true });
    await writeFile(
      path.join(projectPath, PROJECT_MARKER_FILE),
      markerFile(name),
    );

    if (has(ANALYTICS_ITEMS.readme)) {
      await writeFile(
        path.join(projectPath, 'README.md'),
        readmeFile(name, include, connection),
      );
    }
    if (has(ANALYTICS_ITEMS.notebooks)) {
      // The starter notebook (afterCreate) fills the folder when it's chosen
      await makeFolder(
        path.join(projectPath, PROJECT_NOTEBOOKS_DIR),
        !has(ANALYTICS_ITEMS.starterNotebook),
      );
    }
    if (has(ANALYTICS_ITEMS.sql)) {
      await makeFolder(path.join(projectPath, 'sql'), false);
      await writeFile(
        path.join(projectPath, 'sql', 'scratch.sql'),
        sqlScratchFile(),
      );
    }
    if (has(ANALYTICS_ITEMS.data)) {
      await makeFolder(path.join(projectPath, 'data'), true);
    }
    if (has(ANALYTICS_ITEMS.pipelines)) {
      await makeFolder(path.join(projectPath, 'rosetta', 'pipelines'), true);
    }
    if (has(ANALYTICS_ITEMS.gitignore)) {
      await writeFile(path.join(projectPath, '.gitignore'), gitignoreFile());
    }
  },

  async afterCreate(project, include) {
    if (
      !include.includes(ANALYTICS_ITEMS.notebooks) ||
      !include.includes(ANALYTICS_ITEMS.starterNotebook)
    ) {
      return;
    }
    const connection = project.connectionId
      ? await ConnectorsService.getConnectionById(project.connectionId)
      : undefined;
    await PythonNotebooksService.createNotebookInProject(
      project.id,
      project.connectionId,
      { name: 'Getting started', pythonVersion: RECOMMENDED_PYTHON_VERSION },
      starterNotebookCells(connection?.connection?.name),
    );
  },

  async onConnectionChanged() {
    // Nothing to write: no profiles.yml, no main.conf.
  },

  async readConnectionFiles() {
    return {};
  },
};
