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

export const isSuccessfulGenericFileWrite = (
  toolName: string,
  status: string,
  result: unknown,
): boolean =>
  (toolName === 'writeFile' || toolName === 'writeDbtModel') &&
  status === 'done' &&
  !!result &&
  typeof result === 'object' &&
  (result as { success?: unknown }).success === true;

export const getSuccessfulPipelineMutation = (
  toolName: string,
  result: unknown,
): {
  relativePath: string;
  added: number;
  removed: number;
  created: boolean;
  previousContent?: string;
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
    created: value.created === true,
    previousContent:
      typeof value.previousContent === 'string'
        ? value.previousContent
        : undefined,
  };
};

export interface PipelineChangedFile {
  path: string;
  added: number;
  removed: number;
  discard:
    | { action: 'delete' }
    | { action: 'restore'; content: string }
    | { action: 'rollback'; mutationId: string };
}

export const partitionDiscardResults = (
  files: PipelineChangedFile[],
  results: PromiseSettledResult<unknown>[],
): {
  successfulFiles: PipelineChangedFile[];
  failedFiles: PipelineChangedFile[];
} =>
  files.reduce(
    (partition, file, index) => {
      if (results[index]?.status === 'fulfilled') {
        partition.successfulFiles.push(file);
      } else {
        partition.failedFiles.push(file);
      }
      return partition;
    },
    {
      successfulFiles: [] as PipelineChangedFile[],
      failedFiles: [] as PipelineChangedFile[],
    },
  );

export function resolveProjectFileMutationPath(
  projectPath: string,
  candidatePath: string,
): string | null {
  if (!projectPath || !candidatePath || candidatePath.includes('\0')) {
    return null;
  }
  const normalizedProject = projectPath
    .replace(/\\/gu, '/')
    .replace(/\/+$/u, '');
  const normalizedCandidate = candidatePath.replace(/\\/gu, '/');
  const isAbsolute =
    normalizedCandidate.startsWith('/') ||
    /^[a-z]:\//iu.test(normalizedCandidate);
  const relativePath = isAbsolute
    ? normalizedCandidate.slice(normalizedProject.length).replace(/^\/+/, '')
    : normalizedCandidate;
  if (
    isAbsolute &&
    normalizedCandidate !== normalizedProject &&
    !normalizedCandidate.startsWith(`${normalizedProject}/`)
  ) {
    return null;
  }
  const segments = relativePath.split('/');
  if (
    segments.length === 0 ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    return null;
  }
  const separator = projectPath.includes('\\') ? '\\' : '/';
  return `${projectPath.replace(/[\\/]+$/u, '')}${separator}${segments.join(
    separator,
  )}`;
}

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
  return resolveProjectFileMutationPath(projectPath, relativePath);
};

export const collectSuccessfulPipelineMutations = (
  projectPath: string,
  toolCalls: Array<{ toolName: string; status: string; result?: unknown }>,
): PipelineChangedFile[] => {
  const latestByPath = new Map<string, PipelineChangedFile>();
  toolCalls.forEach((toolCall) => {
    if (toolCall.status !== 'done') return;
    const mutation = getSuccessfulPipelineMutation(
      toolCall.toolName,
      toolCall.result,
    );
    if (!mutation) return;
    const path = resolveProjectMutationPath(projectPath, mutation.relativePath);
    if (!path) return;
    const previous = latestByPath.get(path);
    let discard = previous?.discard;
    if (!discard && mutation.created) {
      discard = { action: 'delete' };
    } else if (!discard && mutation.previousContent !== undefined) {
      discard = {
        action: 'restore',
        content: mutation.previousContent,
      };
    }
    if (!discard) return;
    latestByPath.set(path, {
      path,
      added: mutation.added,
      removed: mutation.removed,
      discard,
    });
  });
  return Array.from(latestByPath.values());
};

export const refreshCleanPipelineDraft = <
  T extends {
    path: string;
    content: string;
    savedContent?: string;
    isModified: boolean;
  },
>(
  previous: T | null,
  filePath: string,
  content: string,
): T | null =>
  previous && previous.path === filePath && !previous.isModified
    ? { ...previous, content, savedContent: content }
    : previous;
