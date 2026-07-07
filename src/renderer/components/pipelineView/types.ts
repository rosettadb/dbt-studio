import type { CloudStepStatus } from '../../../types/cloudAction';

export interface PipelineStep {
  name: string;
  plugin: string;
  command?: string;
  working_dir?: string;
  // git_clone@v1 specific
  url?: string;
  branch?: string;
  dest?: string;
  /**
   * Execution status, populated when a cloud action is mapped onto the local
   * pipeline config. Undefined means "no run associated" → render idle.
   */
  status?: CloudStepStatus;
  duration?: number | null;
  error_message?: string | null;
}

export interface PipelineJob {
  name: string;
  type?: string;
  steps: PipelineStep[];
}

export interface PipelineConfig {
  name: string;
  jobs: PipelineJob[];
}
