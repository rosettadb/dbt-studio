import { canUseAsDbtConnection } from '../../connections/registry.shared';
import type { ProjectTypeDefinition } from '../core/types.shared';

/** Include item: the empty dbt folders (models, seeds, macros, ...). */
export const DBT_TEMPLATE_FOLDERS_ITEM = 'dbtFolders';

export const dbtProjectType: ProjectTypeDefinition = {
  id: 'dbt',
  label: 'dbt project',
  title: 'dbt Project',
  shortTitle: 'dbt',
  description:
    'Build, test and document data models with dbt Core, Rosetta layers and pipelines.',
  capabilities: {
    dbt: true,
    rosettaLayers: true,
    lineage: true,
    runHistory: true,
    pipelines: true,
    datalakeConnections: true,
  },
  acceptsConnection: canUseAsDbtConnection,
  templateItems: [
    {
      id: DBT_TEMPLATE_FOLDERS_ITEM,
      label: 'Template dbt directories',
      description: 'analysis, macros, models, seeds, snapshots and tests',
      defaultOn: true,
    },
  ],
};
