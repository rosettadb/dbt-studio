import type { ProjectAgentToolset } from '../../../extensionApi/main';
import {
  buildProjectPipelineContext,
  createStudioPipelineTools,
  isProtectedPipelineWritePath,
} from './pipeline.tools';

/**
 * What the Pipelines extension gives the project agent: the pipeline
 * authoring tools, the text that tells the agent about them, the pipeline
 * context of the project, and the rule that pipeline files are written only
 * with these tools.
 */
export const pipelineToolset: ProjectAgentToolset = {
  id: 'pipeline',
  tools: [
    {
      name: 'studio_pipeline_list',
      description: 'List pipeline YAML files in the active project',
      readOnly: true,
    },
    {
      name: 'studio_pipeline_read',
      description: 'Read and validate a pipeline and return its content hash',
      listDescription: 'Read and validate a pipeline YAML file',
      readOnly: true,
    },
    {
      name: 'studio_pipeline_generate',
      description:
        'Generate a new validated pipeline under rosetta/pipelines without overwriting',
      listDescription: 'Generate a new validated pipeline YAML file',
      readOnly: false,
    },
    {
      name: 'studio_pipeline_update',
      description:
        'Update an existing validated pipeline using the hash returned by studio_pipeline_read',
      listDescription: 'Update a pipeline using a read content hash',
      readOnly: false,
    },
  ],
  // Studio's keystore tool, which the pipeline guidance tells the agent to
  // use for the env vars of a step.
  relatedTools: [
    {
      name: 'studio_keystore_register_placeholder',
      description:
        'Register a placeholder keystore entry (never a real secret) for an env var a pipeline step needs',
    },
  ],
  createTools: (projectPath) => createStudioPipelineTools(projectPath),
  promptSection: `### Pipeline Authoring Tools
- studio_pipeline_list: List pipeline YAML files in the active project
- studio_pipeline_read: Read and validate a pipeline and return its content hash
- studio_pipeline_generate: Generate a new validated pipeline under rosetta/pipelines without overwriting
- studio_pipeline_update: Update an existing validated pipeline using the hash returned by studio_pipeline_read
- studio_keystore_register_placeholder: Register a placeholder keystore entry (never a real secret) for an env var a pipeline step needs, so it appears in the local "Run with env" dialog for the user to fill in

Always list before selecting a pipeline. Read before every update. Use generate
only for a new canonical path. If update reports stale content, read again and
reconcile the requested change. These tools do not run, stage, commit, push, or
monitor pipelines. When a step you add or update needs an env var that isn't
already referenced elsewhere in the project (e.g. a new TF_VAR_* for a
terraform@v1 step), register it with studio_keystore_register_placeholder so
the user can find and fill it in later - never ask the user for or store a
real secret value yourself.`,
  context: {
    tag: 'pipeline_authoring_context',
    build: (projectPath, project) =>
      buildProjectPipelineContext(projectPath, project),
  },
  guardWrite: (projectPath, filePath) =>
    isProtectedPipelineWritePath(projectPath, filePath)
      ? 'Pipeline files must be generated or updated with studio_pipeline_generate or studio_pipeline_update.'
      : null,
};
