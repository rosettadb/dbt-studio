import {
  isPipelineFile,
  PIPELINE_CONFIG_DIR,
  PIPELINE_CONFIG_FILENAME,
  validatePipelineContent,
} from '../../../shared/pipelines/pipelineConfig';
import type { PipelineConfig } from './types';

export function parsePipelineConfig(content: string): PipelineConfig | null {
  const result = validatePipelineContent(content);
  return result.valid ? (result.config as PipelineConfig) : null;
}

export { isPipelineFile, PIPELINE_CONFIG_DIR, PIPELINE_CONFIG_FILENAME };

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
