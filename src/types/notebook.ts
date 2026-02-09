/**
 * Notebook Types
 * TypeScript interfaces for DuckDB notebook functionality
 */

// Define base types first
export interface CellOutput {
  type: 'table' | 'error' | 'empty';
  data?: any[];
  columns?: string[];
  rowCount?: number;
  error?: string;
  executionTime: number;
}

export interface NotebookCell {
  id: string;
  type: 'sql' | 'markdown' | 'visualization';
  content: string;
  output?: CellOutput;
  executionTime?: number;
  order: number;
}

export interface Notebook {
  id: string;
  instanceId: string; // DataLake instance this notebook belongs to
  name: string;
  description?: string;
  cells: NotebookCell[];
  createdAt: Date;
  updatedAt: Date;
  lastExecutedAt?: Date;
}

export interface NotebookSession {
  notebookId: string;
  instanceId: string;
  connectionId: string; // DuckDB connection handle
  createdAt: Date;
  lastActivityAt: Date;
}

// Request/Response types for IPC
export interface CreateNotebookRequest {
  instanceId: string;
  name: string;
  description?: string;
}

export interface UpdateNotebookRequest {
  instanceId: string;
  notebookId: string;
  name?: string;
  description?: string;
  cells?: NotebookCell[];
}

export interface RunCellRequest {
  instanceId: string;
  notebookId: string;
  cellId: string;
  sql: string;
}

export interface RunAllCellsRequest {
  instanceId: string;
  notebookId: string;
}

export interface RunAllCellsResponse {
  outputs: Map<string, CellOutput>;
  totalExecutionTime: number;
}

export interface NotebookListItem {
  id: string;
  instanceId: string;
  name: string;
  description?: string;
  cellCount: number;
  createdAt: Date;
  updatedAt: Date;
  lastExecutedAt?: Date;
}

export interface NotebookMetadata {
  id: string;
  instanceId: string;
  name: string;
  description?: string;
  cellCount: number;
  createdAt: string; // ISO string for JSON serialization
  updatedAt: string;
  lastExecutedAt?: string;
}

export interface NotebookData {
  id: string;
  instanceId: string;
  name: string;
  description?: string;
  cells: NotebookCell[];
  createdAt: string;
  updatedAt: string;
  lastExecutedAt?: string;
}

// Schema Autocomplete Types (Phase 4)
export interface SchemaMetadata {
  schema_id: number;
  schema_name: string;
  schema_uuid: string;
  path: string | null;
}

export interface TableMetadata {
  table_id: number;
  table_name: string;
  table_uuid: string;
  schema_id: number;
  schema_name: string;
  path: string | null;
  record_count: number | null;
  file_size_bytes: number | null;
}

export interface ColumnMetadata {
  column_id: number;
  column_name: string;
  column_type: string;
  column_order: number;
  nulls_allowed: boolean;
  parent_column: number | null;
  parent_column_name: string | null;
  table_id: number;
  table_name: string;
  schema_name: string;
  contains_null: boolean | null;
  min_value: string | null;
  max_value: string | null;
}

export interface SchemaInfo {
  snapshot_id: number;
  snapshot_time: string;
  schema_version: number;
  schemas: SchemaMetadata[];
  tables: TableMetadata[];
  columns: ColumnMetadata[];
}

export interface CompletionItem {
  label: string;
  kind: number; // monaco.languages.CompletionItemKind
  detail?: string;
  documentation?: string;
  insertText: string;
  sortText?: string;
  range?: any;
}
