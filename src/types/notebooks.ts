/**
 * Notebook Types
 * Type definitions for notebook functionality
 */

import { ConnectionInput } from './backend';

export interface CellOutput {
  type: 'table' | 'error' | 'empty';
  data?: any[];
  columns?: string[];
  rowCount?: number;
  totalRows?: number; // Total rows in full dataset (for pagination)
  executionTime?: number;
  error?: string;
}

export interface NotebookCell {
  id: string;
  type: 'sql' | 'markdown';
  content: string;
  order: number;
  output?: CellOutput;
  status?: 'idle' | 'running' | 'success' | 'error';
  error?: string;
}

export interface Notebook {
  id: string;
  name: string;
  description?: string;
  cells: NotebookCell[];
  createdAt: string;
  updatedAt: string;
  lastExecutedAt?: string;
  cellCount: number;
}

export type NotebookRef =
  | { kind: 'sql'; connectionId: string; notebookId: string }
  | { kind: 'python'; notebookId: string };

export interface PythonCellOutput {
  type: 'stream' | 'result' | 'display' | 'error' | 'truncated' | 'unsupported';
  text?: string;
  name?: string;
  mime?: 'image/png' | 'image/jpeg' | 'text/html' | 'text/plain';
  data?: string;
  truncated?: boolean;
}

export interface PythonNotebookCell {
  id: string;
  cellType: 'code' | 'markdown' | 'raw';
  source: string;
  metadata?: Record<string, unknown>;
  executionCount?: number | null;
  outputProvenance?: {
    documentRevision: number;
    executedAt: string;
  };
  outputs?: PythonCellOutput[];
}

export interface PythonNotebook {
  id: string;
  name: string;
  cells: PythonNotebookCell[];
  createdAt: string;
  updatedAt: string;
  revision: number;
  metadata?: Record<string, unknown>;
}

export type PythonNotebookEvent =
  | {
      type: 'status';
      notebookId: string;
      cellId: string;
      executionId: string;
      status: 'running' | 'success' | 'error';
    }
  | {
      type: 'stream' | 'result' | 'display' | 'display-update';
      notebookId: string;
      cellId: string;
      executionId: string;
      text: string;
      truncated?: boolean;
      mime?: PythonCellOutput['mime'];
      data?: string;
    }
  | {
      type: 'clear-output';
      notebookId: string;
      cellId: string;
      executionId: string;
      wait: boolean;
    }
  | {
      type: 'error';
      notebookId: string;
      cellId: string;
      executionId: string;
      name: string;
      text: string;
      truncated?: boolean;
    }
  | {
      type: 'session';
      notebookId: string;
      status:
        | 'idle'
        | 'running'
        | 'interrupting'
        | 'restarting'
        | 'stopped'
        | 'dead';
      message?: string;
    };

export interface PythonNotebookExecuteRequest {
  notebookId: string;
  cellId: string;
  revision: number;
  requestId: string;
}

export interface PythonNotebookExecuteResponse {
  executionId: string;
}

export interface PythonNotebookRunAllRequest {
  notebookId: string;
  revision: number;
  requestId: string;
}

export interface PythonNotebookSessionSnapshot {
  notebookId: string;
  state:
    | 'idle'
    | 'running'
    | 'interrupting'
    | 'restarting'
    | 'stopped'
    | 'dead';
  generation: number;
  events: PythonNotebookEvent[];
}

export type PythonNotebookRuntimeState =
  | 'not-installed'
  | 'installing'
  | 'updating'
  | 'uninstalling'
  | 'ready'
  | 'needs-attention';

export interface PythonNotebookPackageStatus {
  name: 'ipykernel' | 'jupyter_client' | 'nbformat';
  requiredVersion: string;
  installedVersion: string | null;
}

export interface PythonNotebookPackageVersionListItem {
  version: string;
  isPrerelease?: boolean;
}

export interface PythonNotebookPackageVersionListResponse {
  packageName: PythonNotebookPackageStatus['name'];
  versions: PythonNotebookPackageVersionListItem[];
  latestStable: string | null;
}

export interface PythonNotebookPackageActionRequest {
  packageName: PythonNotebookPackageStatus['name'];
  expectedActiveSessionCount: number;
}

export interface PythonNotebookPackageInstallRequest
  extends PythonNotebookPackageActionRequest {
  version: string;
}

export type PythonNotebookEnvironmentKind =
  | 'managed'
  | 'base'
  | 'project'
  | 'custom';

export interface PythonNotebookEnvironmentStatus {
  id: string;
  kind: PythonNotebookEnvironmentKind;
  label: string;
  pythonPath: string | null;
  pythonVersion: string | null;
  rootPath: string | null;
  exists: boolean;
  writable: boolean;
  kernelReady: boolean | null;
  isSelected: boolean;
}

export interface PythonNotebookSelectedEnvironment {
  id: string;
  kind: PythonNotebookEnvironmentKind;
  label: string;
  pythonPath: string;
  pythonVersion: string | null;
  rootPath: string | null;
  writable: boolean;
}

export interface PythonNotebookDataPackageStatus {
  name: string;
  installedVersion: string | null;
}

export interface PythonNotebookUserPackageStatus {
  name: string;
  extras: string[];
  requestedVersion: string | null;
  installedVersion: string | null;
}

export interface PythonNotebookRuntimeStatus {
  state: PythonNotebookRuntimeState;
  managedPython: {
    available: boolean;
    version: string | null;
    minimumVersion: string;
  };
  environmentPath: string;
  packages: PythonNotebookPackageStatus[];
  activeSessionCount: number;
  operation: {
    state: 'idle' | 'installing' | 'checking' | 'updating' | 'uninstalling';
    message?: string;
    error?: string;
  };
  message?: string;
  /** Phase 11: IDE-style environment selection and package management. */
  selectedEnvironment: PythonNotebookSelectedEnvironment | null;
  environments: PythonNotebookEnvironmentStatus[];
  dataPackages: PythonNotebookDataPackageStatus[];
  userPackages: PythonNotebookUserPackageStatus[];
  requirementsSnippet: string;
  kernelReady: boolean;
}

export interface PythonNotebookSelectEnvironmentRequest {
  environmentId: string;
  expectedActiveSessionCount: number;
  /** Active project path, used to resolve project-local environments. */
  projectPath?: string;
}

export interface PythonNotebookCustomInterpreterRequest {
  path: string;
}

export interface PythonNotebookRemoveEnvironmentRequest {
  environmentId: string;
}

export interface PythonNotebookUserPackageRequest {
  name: string;
  extras?: string[];
  version?: string;
  expectedActiveSessionCount: number;
}

export interface PythonNotebookUserPackageActionRequest {
  name: string;
  expectedActiveSessionCount: number;
}

export interface PythonNotebookUserPackageVersionListResponse {
  packageName: string;
  latestStable: string | null;
  versions: PythonNotebookPackageVersionListItem[];
}

export interface PythonNotebookEnvironmentSummary {
  environmentId: string;
  environmentKind: PythonNotebookEnvironmentKind;
  environmentLabel: string;
  pythonVersion: string | null;
  kernelReady: boolean;
  requiredPackages: Array<{ name: string; installedVersion: string | null }>;
  dataPackages: PythonNotebookDataPackageStatus[];
  userPackages: PythonNotebookUserPackageStatus[];
  installHint: string;
}

/** Preview of a notebook JSON export file, returned before the file is actually imported. */
export interface NotebookImportPreview {
  isBulk: boolean;
  notebookCount: number;
  /** Present only if the export included full connection details (see "Include connection details" export option). */
  connection?: ConnectionInput;
  connectionName?: string;
}

export interface CompletionItem {
  label: string;
  kind: number;
  detail?: string;
  documentation?: string;
  insertText: string;
  sortText?: string;
}

export interface SchemaInfo {
  schemas: Array<{
    schema_id: string;
    schema_name: string;
  }>;
  tables: Array<{
    table_name: string;
    schema_name: string;
    record_count?: number;
    path?: string;
  }>;
  columns: Array<{
    column_name: string;
    column_type: string;
    table_name: string;
    schema_name: string;
    nulls_allowed?: boolean;
    min_value?: any;
    max_value?: any;
    parent_column?: string;
    parent_column_name?: string;
  }>;
}
