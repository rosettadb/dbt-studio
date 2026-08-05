export type CloudActionStatus =
  | 'PENDING'
  | 'STARTING'
  | 'RUNNING'
  | 'CANCELLING'
  | 'CANCELLED'
  | 'FINISHED'
  | 'FAILED';

export type CloudStepStatus =
  | 'pending'
  | 'not_started'
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export const TERMINAL_ACTION_STATUSES: ReadonlyArray<CloudActionStatus> = [
  'CANCELLED',
  'FINISHED',
  'FAILED',
];

export const isTerminalActionStatus = (status?: string | null): boolean => {
  if (!status) return false;
  return TERMINAL_ACTION_STATUSES.includes(status as CloudActionStatus);
};

export interface CloudPipelineStep {
  id: string;
  name: string;
  status: CloudStepStatus;
  plugin?: string;
  command?: string;
  working_dir?: string;
  started_at?: string | null;
  finished_at?: string | null;
  duration?: number | null;
  error_message?: string | null;
}

export interface CloudPipelineData {
  // Overall CI/CD container status — authoritative for whether the run is
  // done. Steps are updated conditionally and may not all reach a terminal
  // state even after the run finishes, so this must take priority over any
  // status derived from `steps`.
  status?: CloudActionStatus;
  steps: CloudPipelineStep[];
  metadata?: {
    job_name?: string;
    pipeline_name?: string;
    version?: string;
    generated_at?: string;
  };
}

export interface CloudActionSummary {
  id: string;
  projectId: string;
  action_title?: string;
  status: CloudActionStatus;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
}

export interface CloudLogEntry {
  timestamp: string;
  message: string;
  labels?: Record<string, string>;
}
