/** One tool of a toolset, as the project agent and the AI settings list it. */
export interface ProjectToolInfo {
  name: string;
  /** One line for the agent's own tool lists. */
  description: string;
  /** One line for the tool list in AI settings; defaults to `description`. */
  listDescription?: string;
  /**
   * A tool that only reads is offered in Ask mode and listed there. One that
   * changes something is left out in Ask mode.
   */
  readOnly: boolean;
}

/**
 * A set of tools an extension gives to the project agent (the assistant of
 * the project screen), with the text that tells the agent about them.
 */
export interface ProjectAgentToolset {
  id: string;
  /** The tools, in the order they are given to the model. */
  tools: ProjectToolInfo[];
  /** Builds the tools for a project, keyed by tool name. */
  createTools: (projectPath: string) => Record<string, any>;
  /**
   * Tools of Studio that this toolset tells the agent to use; they are
   * listed after its own in the tool list of projects without dbt.
   */
  relatedTools?: ReadonlyArray<{ name: string; description: string }>;
  /**
   * The section of the tool list in the Code-mode instructions of dbt
   * projects: a `### Heading` line, one line per tool, and guidance.
   */
  promptSection?: string;
  /** A block of context for the instructions, built for every run. */
  context?: {
    /** The block is wrapped in `<tag>...</tag>`. */
    tag: string;
    build: (
      projectPath: string,
      project: { hasDbt: boolean },
    ) => Promise<string | undefined> | string | undefined;
  };
  /**
   * Files of the project that must only be written with this toolset's own
   * tools: returns the message for the agent when the general file tools
   * are about to write `filePath`, or null to let them.
   */
  guardWrite?: (projectPath: string, filePath: string) => string | null;
}

const toolsets: ProjectAgentToolset[] = [];

/**
 * Adds a toolset to the project agent. Returns the function that takes it
 * out again. A tool name that is already taken is refused.
 */
export function registerProjectToolset(
  toolset: ProjectAgentToolset,
): () => void {
  const taken = new Set(
    toolsets.flatMap((existing) => existing.tools.map((info) => info.name)),
  );
  const clash = toolset.tools.find((info) => taken.has(info.name));
  if (toolsets.some((existing) => existing.id === toolset.id) || clash) {
    throw new Error(
      clash
        ? `The project agent already has a tool named "${clash.name}"`
        : `The project agent already has the toolset "${toolset.id}"`,
    );
  }
  toolsets.push(toolset);
  return () => {
    const index = toolsets.indexOf(toolset);
    if (index >= 0) toolsets.splice(index, 1);
  };
}

/** The toolsets, in the order they were added. */
export const listProjectToolsets = (): ReadonlyArray<ProjectAgentToolset> =>
  toolsets;

/** The name of every contributed tool. */
export const projectToolsetToolNames = (): string[] =>
  toolsets.flatMap((toolset) => toolset.tools.map((info) => info.name));

/** The names of the contributed tools that only read. */
export const projectToolsetReadOnlyNames = (): string[] =>
  toolsets.flatMap((toolset) =>
    toolset.tools.filter((info) => info.readOnly).map((info) => info.name),
  );

/** The contributed tools of a project, in toolset order. */
export const createProjectToolsetTools = (
  projectPath: string,
): Record<string, any> =>
  toolsets.reduce<Record<string, any>>(
    (tools, toolset) => ({ ...tools, ...toolset.createTools(projectPath) }),
    {},
  );

/** The context blocks of the toolsets for one run, as `{ tag, text }`. */
export const buildProjectToolsetContexts = async (
  projectPath: string,
  project: { hasDbt: boolean },
): Promise<Array<{ tag: string; text: string }>> => {
  const built = await Promise.all(
    toolsets.map(async (toolset) => ({
      tag: toolset.context?.tag ?? '',
      text: toolset.context
        ? await toolset.context.build(projectPath, project)
        : undefined,
    })),
  );
  return built.filter((block): block is { tag: string; text: string } =>
    Boolean(block.text),
  );
};

/**
 * The message for the agent when a general file tool must not write
 * `filePath` (it belongs to a toolset's own tools), or null.
 */
export const findProjectWriteGuard = (
  projectPath: string,
  filePath: string,
): string | null => {
  let message: string | null = null;
  toolsets.some((toolset) => {
    message = toolset.guardWrite?.(projectPath, filePath) ?? null;
    return message !== null;
  });
  return message;
};
