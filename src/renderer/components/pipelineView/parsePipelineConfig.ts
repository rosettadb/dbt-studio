import yaml from 'js-yaml';
import { z } from 'zod';
import type { PipelineConfig } from './types';

// Mirrors PipelineStep/PipelineJob/PipelineConfig in ./types. Every field
// that downstream rendering (PipelineNode, PipelineGraph) accesses without a
// null-check is required here, so a structurally-broken pipeline.yml is
// rejected at parse time instead of throwing later during render.
const pipelineStepSchema = z.object({
  name: z.string(),
  plugin: z.string(),
  command: z.string().optional(),
  working_dir: z.string().optional(),
  url: z.string().optional(),
  branch: z.string().optional(),
  dest: z.string().optional(),
});

const pipelineJobSchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  steps: z.array(pipelineStepSchema),
});

const pipelineConfigSchema = z.object({
  name: z.string(),
  jobs: z.array(pipelineJobSchema),
});

export function parsePipelineConfig(content: string): PipelineConfig | null {
  try {
    const parsed = yaml.load(content);
    const result = pipelineConfigSchema.safeParse(parsed);
    if (!result.success) return null;
    return result.data;
  } catch {
    return null;
  }
}

// Filename detection
export const PIPELINE_CONFIG_FILENAME = 'pipeline.yml';
export const PIPELINE_CONFIG_DIR = '.rosetta';

export function isPipelineFile(filePath: string): boolean {
  const parts = filePath.replace(/\\/g, '/').split('/');
  const fileName = parts[parts.length - 1];
  const dirName = parts[parts.length - 2];
  return dirName === PIPELINE_CONFIG_DIR && fileName.endsWith('.yml');
}

export const PIPELINE_CONFIG_TEMPLATE = `name: "CI"
jobs:
  - name: "my-job"
    steps:
      - name: Terraform (create resources)
        plugin: terraform@v1
        command: terraform init && terraform apply -auto-approve
        working_dir: terraform

      - name: Rosetta apply (create tables)
        plugin: rosetta@v1
        command: rosetta apply -s bigquery
        working_dir: rosetta

      - name: dbt seed (load sample data)
        plugin: dbt@v1
        command: dbt seed
        working_dir: dbt

      - name: dbt run (build models)
        plugin: dbt@v1
        command: dbt run
        working_dir: dbt

      - name: dbt test
        plugin: dbt@v1
        command: dbt test
        working_dir: dbt
`;
