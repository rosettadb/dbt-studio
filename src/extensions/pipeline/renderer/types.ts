import type { CloudStepStatus } from '../../../extensionApi/studio/types';
import type { StepParams } from '../shared/pipelineShared';

export interface PipelineStep {
  name: string;
  plugin: string;
  /**
   * Every other key of the step, as written in the file. Which of them the
   * designer shows as form fields comes from the plugin's manifest entry;
   * the rest are kept as they are.
   */
  params: StepParams;
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
  /** Every other key of the job (e.g. `needs`), kept as written. */
  extra?: Record<string, unknown>;
}

export interface PipelineConfig {
  name: string;
  jobs: PipelineJob[];
}
