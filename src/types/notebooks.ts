/**
 * Notebook Types
 * Type definitions for notebook functionality
 */

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
