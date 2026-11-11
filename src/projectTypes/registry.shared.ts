import type { ProjectType, ProjectTypeDefinition } from './core/types.shared';
import { dbtProjectType } from './dbt/dbt.shared';
import { analyticsProjectType } from './analytics/analytics.shared';

export type {
  ProjectType,
  ProjectTypeCapabilities,
  ProjectTemplateItem,
  ProjectTypeDefinition,
} from './core/types.shared';
export { PROJECT_MARKER_FILE } from './core/types.shared';

/** One definition per type. A missing key fails tsc. */
const definitions: { readonly [K in ProjectType]: ProjectTypeDefinition } = {
  dbt: dbtProjectType,
  analytics: analyticsProjectType,
};

/** Wizard order. */
const ORDER: ProjectType[] = ['dbt', 'analytics'];

export const DEFAULT_PROJECT_TYPE: ProjectType = 'dbt';

export function isProjectType(value: unknown): value is ProjectType {
  return typeof value === 'string' && value in definitions;
}

/** The project's type; projects saved before plan 95 have none and are dbt. */
export function getProjectType(
  project?: { type?: ProjectType | string } | null,
): ProjectType {
  const type = project?.type;
  return isProjectType(type) ? type : DEFAULT_PROJECT_TYPE;
}

export function getProjectTypeDefinition(
  type: ProjectType,
): ProjectTypeDefinition {
  return definitions[type] ?? definitions[DEFAULT_PROJECT_TYPE];
}

/** Shorthand for getProjectTypeDefinition(getProjectType(project)). */
export function projectTypeOf(
  project?: { type?: ProjectType | string } | null,
): ProjectTypeDefinition {
  return getProjectTypeDefinition(getProjectType(project));
}

export function listProjectTypes(): ProjectTypeDefinition[] {
  return ORDER.map((type) => definitions[type]);
}

/** The Include items that are on when the wizard opens for this type. */
export function defaultTemplateItems(type: ProjectType): string[] {
  return getProjectTypeDefinition(type)
    .templateItems.filter((item) => item.defaultOn)
    .map((item) => item.id);
}
