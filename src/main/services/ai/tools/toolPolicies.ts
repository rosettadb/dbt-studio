// src/main/services/ai/tools/toolPolicies.ts
export interface PathPolicy {
  allowedRoots: string[];
}

export interface ApprovalPolicy {
  required: boolean;
  condition?: 'always' | 'dml_ddl' | 'mutation';
}

export interface OutputPolicy {
  maxTokens: number;
  truncationMarker: string;
}

export interface TelemetryPolicy {
  events: Array<'tool_start' | 'tool_success' | 'tool_error'>;
}

export const defaultOutputPolicy: OutputPolicy = {
  maxTokens: 3_000,
  truncationMarker: '\n[...output truncated...]',
};
