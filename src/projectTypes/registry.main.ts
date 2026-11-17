import {
  getProjectType,
  type ProjectType,
  type ProjectTypeMain,
} from './registry.shared';
import { dbtProjectTypeMain } from './dbt/dbt.main';
import { analyticsProjectTypeMain } from './analytics/analytics.main';

export type { ProjectTypeMain, ScaffoldInput } from './registry.shared';

/** One instance per type. A missing key fails tsc. */
const mains: { readonly [K in ProjectType]: ProjectTypeMain } = {
  dbt: dbtProjectTypeMain,
  analytics: analyticsProjectTypeMain,
};

/**
 * Order in which clone and import try the types. The first one that finds a
 * root wins. Analytics accepts any folder, so it must stay last.
 */
const DETECT_ORDER: ProjectType[] = ['dbt', 'analytics'];

export function getProjectTypeMain(type: ProjectType): ProjectTypeMain {
  return mains[type];
}

/** Shorthand for getProjectTypeMain(getProjectType(project)). */
export function projectTypeMainOf(
  project?: { type?: ProjectType | string } | null,
): ProjectTypeMain {
  return mains[getProjectType(project)];
}

/**
 * The type of an existing folder (clone, import) and the project root in it:
 * a folder with dbt_project.yml (at the root or below) is dbt, any other
 * folder is Analytics. Projects have no marker file (plan 95a, D1).
 */
export async function detectProjectType(
  folder: string,
): Promise<{ type: ProjectType; root: string }> {
  const roots = await Promise.all(
    DETECT_ORDER.map((type) => mains[type].detectRoot(folder)),
  );
  const index = roots.findIndex((root) => !!root);
  return index === -1
    ? { type: DETECT_ORDER[DETECT_ORDER.length - 1], root: folder }
    : { type: DETECT_ORDER[index], root: roots[index] as string };
}
