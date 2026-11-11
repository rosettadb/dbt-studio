import React from 'react';
import { icons } from '../../../assets';
import { ProjectDbtSplitButton } from '../../renderer/components/dbtModelButtons';
import type { Project } from '../../types/backend';
import type { ProjectTypeUi } from '../core/types.ui';

// The coloured dbt logo as a plain <img> (the Home "dbt" card uses the same
// file), so it needs no fetch and reads in light and dark themes.
const DbtIcon: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <img
    src={icons.dbtTm}
    alt="dbt"
    style={{ width: size, height: size, objectFit: 'contain' }}
  />
);

// A wrapper, not the component itself, so the reference is read at render
// time and an import cycle through components/ can't leave it undefined.
const DbtTopMenuActions: React.FC<{ project: Project }> = ({ project }) => (
  <ProjectDbtSplitButton project={project} />
);

export const dbtProjectTypeUi: ProjectTypeUi = {
  Icon: DbtIcon,
  TopMenuActions: DbtTopMenuActions,
};
