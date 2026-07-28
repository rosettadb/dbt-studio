import yaml from 'js-yaml';
import { z } from 'zod';

export const PIPELINE_CONFIG_FILENAME = 'pipeline.yml';
export const PIPELINE_CONFIG_DIR = '.rosetta';
export const PIPELINE_MAX_FILES = 100;

const pipelineStepSchema = z
  .object({
    name: z.string().trim().min(1, 'Step name is required'),
    plugin: z.string().trim().min(1, 'Step plugin is required'),
    command: z.string().optional(),
    working_dir: z.string().optional(),
    url: z.string().optional(),
    branch: z.string().optional(),
    dest: z.string().optional(),
  })
  .passthrough();

const pipelineJobSchema = z
  .object({
    name: z.string().trim().min(1, 'Job name is required'),
    type: z.string().optional(),
    steps: z.array(pipelineStepSchema),
  })
  .passthrough();

export const pipelineConfigSchema = z
  .object({
    name: z.string().trim().min(1, 'Pipeline name is required'),
    jobs: z.array(pipelineJobSchema),
  })
  .passthrough();

export type SharedPipelineConfig = z.infer<typeof pipelineConfigSchema>;

export type PipelineValidationIssue = {
  path: string;
  message: string;
};

export type PipelineValidationResult =
  | {
      valid: true;
      config: SharedPipelineConfig;
      issues: [];
      warnings: string[];
    }
  | {
      valid: false;
      issues: PipelineValidationIssue[];
      warnings: string[];
    };

const ROOT_KEYS = new Set(['name', 'jobs']);
const JOB_KEYS = new Set(['name', 'type', 'steps']);
const STEP_KEYS = new Set([
  'name',
  'plugin',
  'command',
  'working_dir',
  'url',
  'branch',
  'dest',
]);

const hasUnknownKeys = (
  value: Record<string, unknown>,
  known: Set<string>,
): boolean => Object.keys(value).some((key) => !known.has(key));

const hasVisualEditorUnknownFields = (value: unknown): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const root = value as Record<string, unknown>;
  if (hasUnknownKeys(root, ROOT_KEYS) || !Array.isArray(root.jobs)) return true;
  return root.jobs.some((job) => {
    if (!job || typeof job !== 'object' || Array.isArray(job)) return false;
    const jobRecord = job as Record<string, unknown>;
    if (hasUnknownKeys(jobRecord, JOB_KEYS)) return true;
    if (!Array.isArray(jobRecord.steps)) return false;
    return jobRecord.steps.some(
      (step) =>
        !!step &&
        typeof step === 'object' &&
        !Array.isArray(step) &&
        hasUnknownKeys(step as Record<string, unknown>, STEP_KEYS),
    );
  });
};

export function validatePipelineContent(
  content: string,
): PipelineValidationResult {
  let parsed: unknown;
  try {
    parsed = yaml.load(content);
  } catch {
    return {
      valid: false,
      issues: [{ path: '$', message: 'Pipeline YAML could not be parsed' }],
      warnings: [],
    };
  }

  const result = pipelineConfigSchema.safeParse(parsed);
  const warnings = hasVisualEditorUnknownFields(parsed)
    ? [
        'This pipeline contains fields that the visual editor may not preserve when it saves.',
      ]
    : [];

  if (!result.success) {
    return {
      valid: false,
      issues: result.error.issues.slice(0, 20).map((issue) => ({
        path: issue.path.length > 0 ? issue.path.join('.') : '$',
        message: issue.message,
      })),
      warnings,
    };
  }

  return {
    valid: true,
    config: result.data,
    issues: [],
    warnings,
  };
}

export function isPipelineFile(filePath: string): boolean {
  const parts = filePath.replace(/\\/g, '/').split('/');
  const fileName = parts[parts.length - 1];
  const dirName = parts[parts.length - 2];
  return (
    dirName === PIPELINE_CONFIG_DIR &&
    typeof fileName === 'string' &&
    fileName.endsWith('.yml')
  );
}

export function isDiscoverablePipelineFileName(fileName: string): boolean {
  return (
    fileName !== 'main.conf' &&
    (fileName.endsWith('.yml') || fileName.endsWith('.yaml')) &&
    !fileName.includes('/') &&
    !fileName.includes('\\')
  );
}

export function isWritablePipelineRelativePath(relativePath: string): boolean {
  if (
    !relativePath ||
    relativePath.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(relativePath)
  ) {
    return false;
  }
  const normalized = relativePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return (
    parts.length === 2 &&
    parts[0] === PIPELINE_CONFIG_DIR &&
    parts[1].endsWith('.yml') &&
    parts[1] !== '.yml' &&
    parts.every((part) => part !== '.' && part !== '..' && part.length > 0)
  );
}

export function isReadablePipelineRelativePath(relativePath: string): boolean {
  if (
    !relativePath ||
    relativePath.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(relativePath)
  ) {
    return false;
  }
  const normalized = relativePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return (
    parts.length === 2 &&
    parts[0] === PIPELINE_CONFIG_DIR &&
    isDiscoverablePipelineFileName(parts[1]) &&
    parts.every((part) => part !== '.' && part !== '..' && part.length > 0)
  );
}
