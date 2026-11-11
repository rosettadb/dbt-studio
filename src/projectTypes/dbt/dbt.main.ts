import ProjectsService from '../../main/services/projects.service';
import ConnectorsService from '../../main/services/connectors.service';
import type { ProjectTypeMain } from '../core/types.main';
import { DBT_TEMPLATE_FOLDERS_ITEM } from './dbt.shared';

/**
 * dbt projects do exactly what Studio did before project types existed: the
 * hooks call the same ProjectsService / ConnectorsService code, in the same
 * order, so a dbt project's files don't change.
 */
export const dbtProjectTypeMain: ProjectTypeMain = {
  async scaffold({ projectPath, name, include }) {
    await ProjectsService.copyDbtTemplateFiles(projectPath, name);
    // Always copy main.conf (Rosetta requires it); profiles.yml is generated
    // once a connection is configured.
    await ProjectsService.copyRosettaMainConf(projectPath);
    if (include.includes(DBT_TEMPLATE_FOLDERS_ITEM)) {
      await ProjectsService.createDbtTemplateFolderStructure(projectPath);
    }
  },

  async afterCreate() {
    // Nothing: profiles.yml comes from onConnectionChanged.
  },

  async onConnectionChanged(project) {
    await ConnectorsService.loadConfigurations(project.id);
  },

  async readConnectionFiles(project) {
    // Populate rosettaConnection and dbtConnection without regenerating files
    const parsed = await ConnectorsService.parseProjectConnectionFiles(
      project.path,
    );
    return {
      rosettaConnection: parsed.rosettaConnection,
      dbtConnection: parsed.dbtConnection,
    };
  },
};
