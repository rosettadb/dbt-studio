export interface PipelineStep {
  name: string;
  plugin: string;
  command: string;
  working_dir?: string;
}

export interface PipelineJob {
  name: string;
  steps: PipelineStep[];
}

export interface PipelineConfig {
  name: string;
  jobs: PipelineJob[];
}
