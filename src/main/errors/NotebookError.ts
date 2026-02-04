/**
 * Notebook Error Classes
 * Custom error classes for notebook operations
 */

/* eslint-disable max-classes-per-file */

export class NotebookError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any,
  ) {
    super(message);
    this.name = 'NotebookError';
  }
}

export class NotebookNotFoundError extends NotebookError {
  constructor(notebookId: string) {
    super(`Notebook not found: ${notebookId}`, 'NOTEBOOK_NOT_FOUND', {
      notebookId,
    });
  }
}

export class SessionNotFoundError extends NotebookError {
  constructor(notebookId: string) {
    super(`Session not found: ${notebookId}`, 'SESSION_NOT_FOUND', {
      notebookId,
    });
  }
}

export class CellExecutionError extends NotebookError {
  constructor(cellId: string, originalError: Error) {
    super(
      `Cell execution failed: ${originalError.message}`,
      'CELL_EXECUTION_ERROR',
      { cellId, originalError: originalError.message },
    );
  }
}
