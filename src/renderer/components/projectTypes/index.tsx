import React from 'react';
import { blue } from '@mui/material/colors';
import { icons } from '../../../../assets';
import { ProjectDbtSplitButton } from '../dbtModelButtons';
import type { Project } from '../../../types/backend';
import type { ProjectType, ProjectTypeUi } from '../../../types/projectTypes';
import { getProjectType } from '../../../shared/projectTypes';

/**
 * Renderer side of project types (plan 95a): each type's icon and its
 * actions in the Project screen's top bar.
 */

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

// MUI FolderOutlined path: a 2px folder outline with a transparent inside
const FOLDER_OUTLINE =
  'm9.17 6 2 2H20v10H4V6zM10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8z';

// An outlined project folder with three solid bars inside: a project for
// analyzing data. Both in MUI blue 600 in light and dark mode, like the dbt
// logo keeps its own colour. The viewBox is cropped to the folder so it fills
// the icon box, and solid bars stay visible at small sizes.
const AnalyticsIcon: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="2 2 20 20"
    width={size}
    height={size}
    fill={blue[600]}
    style={{ display: 'block', flexShrink: 0 }}
    aria-hidden
  >
    <path d={FOLDER_OUTLINE} />
    <rect x="6.6" y="13" width="2.4" height="3.6" rx="0.4" />
    <rect x="10.8" y="10.4" width="2.4" height="6.2" rx="0.4" />
    <rect x="15" y="11.8" width="2.4" height="4.8" rx="0.4" />
  </svg>
);

/**
 * One entry per type. A missing key fails tsc. Analytics has no top bar
 * actions: it has no dbt commands.
 */
const uis: { readonly [K in ProjectType]: ProjectTypeUi } = {
  dbt: { Icon: DbtIcon, TopMenuActions: DbtTopMenuActions },
  analytics: { Icon: AnalyticsIcon },
};

export function getProjectTypeUi(type: ProjectType): ProjectTypeUi {
  return uis[type];
}

/** Shorthand for getProjectTypeUi(getProjectType(project)). */
export function projectTypeUiOf(
  project?: { type?: ProjectType | string } | null,
): ProjectTypeUi {
  return uis[getProjectType(project)];
}
