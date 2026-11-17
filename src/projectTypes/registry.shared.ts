import type React from 'react';
import type { Project } from '../types/backend';
import { dbtProjectType } from './dbt/dbt.shared';
import { analyticsProjectType } from './analytics/analytics.shared';

/**
 * Project types (plan 95a). A project's type decides what Studio creates in
 * its folder, which connections it accepts and which parts of the project
 * workspace it shows. Type-specific behaviour lives only in
 * `src/projectTypes/<type>/` and is read through the registries; screens,
 * services and hooks never compare `project.type` themselves.
 *
 * The type is stored only in Studio (`Project.type` in database.json); the
 * project folder has no marker file. Clone and import work it out from the
 * folder with `detectProjectType` (registry.main.ts).
 */

/** Every project type. A project saved without `type` is a dbt project. */
export type ProjectType = 'dbt' | 'analytics';

/** What the project workspace shows for a type. */
export interface ProjectTypeCapabilities {
  /** dbt commands, model buttons, dbt compile, Jinja and run code lenses. */
  dbt: boolean;
  /** Rosetta Raw / Staging / Incremental layer generation. */
  rosettaLayers: boolean;
  lineage: boolean;
  runHistory: boolean;
  /** Create Pipeline, local Runner and cloud log panels. */
  pipelines: boolean;
  /**
   * How a DuckLake instance is linked. false: through a saved DuckLake
   * connection, which dbt's profiles.yml needs. true: the instance itself
   * (`ducklake-<id>`), the way the SQL Editor and Notebooks query it.
   */
  datalakeAsInstance: boolean;
}

/** One checkbox in the New Project wizard's Include step. */
export interface ProjectTemplateItem {
  id: string;
  label: string;
  description: string;
  defaultOn: boolean;
  /** Another item that must be included for this one to apply. */
  requires?: string;
}

export interface ProjectTypeDefinition {
  id: ProjectType;
  /** Lower-case noun, e.g. "dbt project". */
  label: string;
  /** Title-case heading, e.g. "dbt Project". */
  title: string;
  /** One sentence for the wizard card. */
  description: string;
  capabilities: ProjectTypeCapabilities;
  /** Whether a saved connection of this type can be the project connection. */
  acceptsConnection: (connectionType: string) => boolean;
  templateItems: ProjectTemplateItem[];
}

export interface ScaffoldInput {
  projectPath: string;
  name: string;
  /** Ids of the ProjectTemplateItems the user kept. */
  include: string[];
  /** The project connection: a saved connection or `ducklake-<instanceId>`. */
  connectionId?: string;
}

/** Main-process behaviour of one project type, read through registry.main.ts. */
export interface ProjectTypeMain {
  /** Write the new project's files. Runs before the project is saved. */
  scaffold(input: ScaffoldInput): Promise<void>;
  /** The project connection was set or changed. */
  onConnectionChanged(project: Project): Promise<void>;
  /** Extra fields read from the project's own files on every project read. */
  readConnectionFiles(project: Project): Promise<Partial<Project>>;
  /**
   * The project root inside `folder` when the folder holds a project of
   * this type (clone and import), else null.
   */
  detectRoot(folder: string): Promise<string | null>;
}

/** Renderer side of one project type, read through registry.renderer.ts. */
export interface ProjectTypeUi {
  /** Type icon at `size` px. */
  Icon: React.ComponentType<{ size?: number }>;
  /** Actions in the project workspace's top bar; none when absent. */
  TopMenuActions?: React.ComponentType<{ project: Project }>;
}

// --- Registry ------------------------------------------------------------

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

/** The project's type; projects saved before plan 95a have none and are dbt. */
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
