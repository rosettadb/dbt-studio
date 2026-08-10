export const PIPELINE_TOOL_NAMES = [
  'studio_pipeline_list',
  'studio_pipeline_read',
  'studio_pipeline_generate',
  'studio_pipeline_update',
] as const;

export const PIPELINE_MUTATION_TOOL_NAMES = [
  'studio_pipeline_generate',
  'studio_pipeline_update',
] as const;

export const isPipelineTool = (toolName: string): boolean =>
  PIPELINE_TOOL_NAMES.includes(
    toolName as (typeof PIPELINE_TOOL_NAMES)[number],
  );

export const isPipelineMutationTool = (toolName: string): boolean =>
  PIPELINE_MUTATION_TOOL_NAMES.includes(
    toolName as (typeof PIPELINE_MUTATION_TOOL_NAMES)[number],
  );

export const getSuccessfulPipelineMutation = (
  toolName: string,
  result: unknown,
): {
  relativePath: string;
  added: number;
  removed: number;
} | null => {
  if (
    !isPipelineMutationTool(toolName) ||
    !result ||
    typeof result !== 'object'
  ) {
    return null;
  }
  const value = result as Record<string, unknown>;
  if (
    value.success !== true ||
    value.mutation !== 'pipeline-file-written' ||
    typeof value.path !== 'string'
  ) {
    return null;
  }
  return {
    relativePath: value.path,
    added: typeof value.linesAdded === 'number' ? value.linesAdded : 0,
    removed: typeof value.linesRemoved === 'number' ? value.linesRemoved : 0,
  };
};

export const resolveProjectMutationPath = (
  projectPath: string,
  relativePath: string,
): string | null => {
  if (!projectPath || !relativePath || relativePath.includes('\\')) return null;
  const segments = relativePath.split('/');
  if (
    relativePath.startsWith('/') ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    return null;
  }
  const isPipelinePath =
    (segments[0] === '.rosetta' && segments.length >= 2) ||
    (segments[0] === 'rosetta' &&
      segments[1] === 'pipelines' &&
      segments.length >= 3);
  if (!isPipelinePath || !/\.ya?ml$/iu.test(segments[segments.length - 1])) {
    return null;
  }
  const separator = projectPath.includes('\\') ? '\\' : '/';
  return `${projectPath.replace(/[\\/]+$/u, '')}${separator}${segments.join(
    separator,
  )}`;
};

export const collectSuccessfulPipelineMutations = (
  projectPath: string,
  toolCalls: Array<{ toolName: string; status: string; result?: unknown }>,
): Array<{ path: string; added: number; removed: number }> => {
  const latestByPath = new Map<
    string,
    { path: string; added: number; removed: number }
  >();
  toolCalls.forEach((toolCall) => {
    if (toolCall.status !== 'done') return;
    const mutation = getSuccessfulPipelineMutation(
      toolCall.toolName,
      toolCall.result,
    );
    if (!mutation) return;
    const path = resolveProjectMutationPath(projectPath, mutation.relativePath);
    if (!path) return;
    latestByPath.set(path, {
      path,
      added: mutation.added,
      removed: mutation.removed,
    });
  });
  return Array.from(latestByPath.values());
};
