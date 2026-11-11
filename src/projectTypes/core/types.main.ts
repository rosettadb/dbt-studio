import type { Project } from '../../types/backend';

export interface ScaffoldInput {
  projectPath: string;
  name: string;
  /** Ids of the ProjectTemplateItems the user kept. */
  include: string[];
  /** The project connection, when one was chosen (no secrets). */
  connection?: { name: string; type: string };
}

/** Main-process behaviour of one project type, read through registry.main.ts. */
export interface ProjectTypeMain {
  /** Write the new project's files. Runs before the project is saved. */
  scaffold(input: ScaffoldInput): Promise<void>;
  /** Runs once the new project is saved (it has an id). */
  afterCreate(project: Project, include: string[]): Promise<void>;
  /** The project connection was set or changed. */
  onConnectionChanged(project: Project): Promise<void>;
  /** Extra fields read from the project's own files on every project read. */
  readConnectionFiles(project: Project): Promise<Partial<Project>>;
}
