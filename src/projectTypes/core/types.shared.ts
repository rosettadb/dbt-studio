/**
 * Project types (plan 95). A project's type decides what Studio creates in
 * its folder, which connections it accepts and which parts of the project
 * workspace it shows. Type-specific behaviour lives only in
 * `src/projectTypes/<type>/` and is read through the registries; screens,
 * services, hooks and agents never compare `project.type` themselves.
 */

/** Every project type. A project saved without `type` is a dbt project. */
export type ProjectType = 'dbt' | 'analytics';

/** File at the root of a non-dbt project folder that names its type. */
export const PROJECT_MARKER_FILE = 'rosetta_project.yml';

/** What the project workspace shows for a type. */
export interface ProjectTypeCapabilities {
  /** dbt commands, model buttons, dbt compile, Jinja, dbt agent tools. */
  dbt: boolean;
  /** Rosetta Raw / Staging / Incremental layer generation. */
  rosettaLayers: boolean;
  lineage: boolean;
  runHistory: boolean;
  /** Create Pipeline, local Runner and cloud log panels. */
  pipelines: boolean;
  /** The wizard offers DuckLake instances as the project connection. */
  datalakeConnections: boolean;
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
  /** The type alone, for small badges, e.g. "dbt". */
  shortTitle: string;
  /** One sentence for the wizard card. */
  description: string;
  capabilities: ProjectTypeCapabilities;
  /** Whether a saved connection of this type can be the project connection. */
  acceptsConnection: (connectionType: string) => boolean;
  templateItems: ProjectTemplateItem[];
}
