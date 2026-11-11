import type { ProjectType } from './core/types.shared';
import type { ProjectTypeUi } from './core/types.ui';
import { getProjectType } from './registry.shared';
import { dbtProjectTypeUi } from './dbt/dbt.ui';
import { analyticsProjectTypeUi } from './analytics/analytics.ui';

export type { ProjectTypeUi } from './core/types.ui';

/** One entry per type. A missing key fails tsc. */
const uis: { readonly [K in ProjectType]: ProjectTypeUi } = {
  dbt: dbtProjectTypeUi,
  analytics: analyticsProjectTypeUi,
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
