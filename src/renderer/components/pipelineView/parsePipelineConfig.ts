import yaml from 'js-yaml';
import type { PipelineConfig } from './types';

export function parsePipelineConfig(content: string): PipelineConfig | null {
  try {
    const parsed = yaml.load(content);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !Array.isArray((parsed as PipelineConfig).jobs)
    ) {
      return null;
    }
    return parsed as PipelineConfig;
  } catch {
    return null;
  }
}

// Filename detection
export const PIPELINE_CONFIG_FILENAME = 'pipeline.yml';
export const PIPELINE_CONFIG_DIR = '.rosetta';

export function isPipelineFile(filePath: string): boolean {
  const parts = filePath.replace(/\\/g, '/').split('/');
  return (
    parts[parts.length - 1] === PIPELINE_CONFIG_FILENAME &&
    parts[parts.length - 2] === PIPELINE_CONFIG_DIR
  );
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
