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
