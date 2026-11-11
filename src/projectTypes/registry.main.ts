import type { ProjectType } from './core/types.shared';
import type { ProjectTypeMain } from './core/types.main';
import { getProjectType } from './registry.shared';
import { dbtProjectTypeMain } from './dbt/dbt.main';
import { analyticsProjectTypeMain } from './analytics/analytics.main';

export type { ProjectTypeMain, ScaffoldInput } from './core/types.main';

/** One instance per type. A missing key fails tsc. */
const mains: { readonly [K in ProjectType]: ProjectTypeMain } = {
  dbt: dbtProjectTypeMain,
  analytics: analyticsProjectTypeMain,
};

export function getProjectTypeMain(type: ProjectType): ProjectTypeMain {
  return mains[type];
}

/** Shorthand for getProjectTypeMain(getProjectType(project)). */
export function projectTypeMainOf(
  project?: { type?: ProjectType | string } | null,
): ProjectTypeMain {
  return mains[getProjectType(project)];
}
