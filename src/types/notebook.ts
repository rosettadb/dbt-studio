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
