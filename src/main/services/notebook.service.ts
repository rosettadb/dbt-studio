/**
 * Notebook Service
 * Main service for managing DuckDB notebooks
 * Handles lifecycle, session management, and execution
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Notebook,
  NotebookSession,
  NotebookListItem,
  CellOutput,
  CreateNotebookRequest,
  UpdateNotebookRequest,
  RunCellRequest,
  RunAllCellsRequest,
  RunAllCellsResponse,
} from '../../types/notebook';
import { NotebookStorageService } from './notebook/storage.service';
import DuckLakeService from './duckLake.service';

export class NotebookService {
  private static sessions: Map<string, NotebookSession> = new Map();

  private static readonly SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

  private static cleanupInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Initialize the notebook service
   */
  static initialize(): void {
    // Start session cleanup interval
    if (!this.cleanupInterval) {
      this.cleanupInterval = setInterval(
        () => {
          this.cleanupIdleSessions();
        },
        5 * 60 * 1000,
      ); // Check every 5 minutes
    }
  }

  /**
   * Shutdown the notebook service
   */
  static shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Dispose all sessions
    this.sessions.clear();
  }

  /**
   * Create a new notebook
   */
  static async createNotebook(
    request: CreateNotebookRequest,
  ): Promise<Notebook> {
    try {
      // Verify instance exists
      await DuckLakeService.getInstance(request.instanceId);

      const now = new Date();
      const notebook: Notebook = {
        id: uuidv4(),
        instanceId: request.instanceId,
        name: request.name,
        description: request.description,
        cells: [],
        createdAt: now,
        updatedAt: now,
      };

      await NotebookStorageService.saveNotebook(notebook);
      return notebook;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  /**
   * Get a notebook by ID
   */
  static async getNotebook(
    instanceId: string,
    notebookId: string,
  ): Promise<Notebook> {
    try {
      return await NotebookStorageService.loadNotebook(instanceId, notebookId);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  /**
   * List all notebooks for an instance
   */
  static async listNotebooks(instanceId: string): Promise<NotebookListItem[]> {
    try {
      return await NotebookStorageService.listNotebooks(instanceId);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  /**
   * Update a notebook
   */
  static async updateNotebook(
    request: UpdateNotebookRequest,
  ): Promise<Notebook> {
    try {
      const notebook = await NotebookStorageService.loadNotebook(
        request.instanceId,
        request.notebookId,
      );

      if (request.name !== undefined) {
        notebook.name = request.name;
      }
      if (request.description !== undefined) {
        notebook.description = request.description;
      }
      if (request.cells !== undefined) {
        notebook.cells = request.cells;
      }

      notebook.updatedAt = new Date();

      await NotebookStorageService.saveNotebook(notebook);
      return notebook;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  /**
   * Delete a notebook
   */
  static async deleteNotebook(
    instanceId: string,
    notebookId: string,
  ): Promise<void> {
    try {
      // Dispose session if exists
      await this.disposeSession(notebookId);

      // Delete from storage
      await NotebookStorageService.deleteNotebook(instanceId, notebookId);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  /**
   * Create or get existing session for a notebook
   */
  static async createSession(
    instanceId: string,
    notebookId: string,
  ): Promise<string> {
    try {
      // Check if session already exists
      const existingSession = this.sessions.get(notebookId);
      if (existingSession) {
        existingSession.lastActivityAt = new Date();
        return existingSession.connectionId;
      }

      // Verify instance exists and get connection
      const instance = await DuckLakeService.getInstance(instanceId);

      const session: NotebookSession = {
        notebookId,
        instanceId: instance.id,
        connectionId: instance.id, // Reuse instance connection
        createdAt: new Date(),
        lastActivityAt: new Date(),
      };

      this.sessions.set(notebookId, session);
      return session.connectionId;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  /**
   * Dispose a session
   */
  static async disposeSession(notebookId: string): Promise<void> {
    try {
      this.sessions.delete(notebookId);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  /**
   * Run a single cell
   */
  static async runCell(request: RunCellRequest): Promise<CellOutput> {
    const startTime = Date.now();

    // eslint-disable-next-line no-console
    console.log('[NotebookService] Running cell:', {
      instanceId: request.instanceId,
      notebookId: request.notebookId,
      cellId: request.cellId,
    });

    try {
      // Ensure session exists
      await this.createSession(request.instanceId, request.notebookId);

      // Load notebook
      const notebook = await NotebookStorageService.loadNotebook(
        request.instanceId,
        request.notebookId,
      );

      // Find cell
      const cell = notebook.cells.find((c) => c.id === request.cellId);
      if (!cell) {
        throw new Error(`Cell not found: ${request.cellId}`);
      }

      // Execute query using DuckLake service
      const result = await DuckLakeService.executeQuery({
        instanceId: notebook.instanceId,
        sql: request.sql,
      });

      // eslint-disable-next-line no-console
      console.log('[NotebookService] Query result:', {
        columns: result.columns,
        rowCount: result.rows.length,
        firstRow: result.rows[0],
      });

      const executionTime = Date.now() - startTime;

      // Transform columns from {name, type}[] to string[]
      const columnNames = result.columns.map((col) => col.name);

      // eslint-disable-next-line no-console
      console.log('[NotebookService] Transformed columns:', columnNames);

      // Transform rows from any[][] to Record<string, any>[]
      const transformedRows = result.rows.map((row) => {
        const rowObj: Record<string, any> = {};
        columnNames.forEach((colName, index) => {
          rowObj[colName] = row[index];
        });
        return rowObj;
      });

      const output: CellOutput = {
        type: 'table',
        data: transformedRows,
        columns: columnNames,
        rowCount: transformedRows.length,
        executionTime,
      };

      // Save output
      await NotebookStorageService.saveCellOutput(
        notebook.instanceId,
        request.notebookId,
        request.cellId,
        output,
      );

      // Update cell in notebook
      cell.output = output;
      cell.executionTime = executionTime;
      notebook.lastExecutedAt = new Date();
      notebook.updatedAt = new Date();
      await NotebookStorageService.saveNotebook(notebook);

      // Update session activity
      const session = this.sessions.get(request.notebookId);
      if (session) {
        session.lastActivityAt = new Date();
      }

      return output;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);

      const executionTime = Date.now() - startTime;
      const errorOutput: CellOutput = {
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
        executionTime,
      };

      // Save error output
      try {
        await NotebookStorageService.saveCellOutput(
          request.instanceId,
          request.notebookId,
          request.cellId,
          errorOutput,
        );
      } catch (saveError) {
        // eslint-disable-next-line no-console
        console.error(saveError);
      }

      // Return error output instead of throwing
      return errorOutput;
    }
  }

  /**
   * Run all cells in a notebook sequentially
   */
  static async runAllCells(
    request: RunAllCellsRequest,
  ): Promise<RunAllCellsResponse> {
    const startTime = Date.now();

    try {
      // Load notebook
      const notebook = await NotebookStorageService.loadNotebook(
        request.instanceId,
        request.notebookId,
      );

      // Execute cells sequentially using reduce
      const outputs = await notebook.cells
        .sort((a, b) => a.order - b.order)
        .reduce(async (previousPromise, cell) => {
          const outputsMap = await previousPromise;

          if (cell.type === 'sql') {
            try {
              const output = await this.runCell({
                instanceId: request.instanceId,
                notebookId: request.notebookId,
                cellId: cell.id,
                sql: cell.content,
              });
              outputsMap.set(cell.id, output);
            } catch (error) {
              // eslint-disable-next-line no-console
              console.error(error);
              // Continue with next cell even if one fails
              const errorOutput: CellOutput = {
                type: 'error',
                error: error instanceof Error ? error.message : String(error),
                executionTime: 0,
              };
              outputsMap.set(cell.id, errorOutput);
            }
          }

          return outputsMap;
        }, Promise.resolve(new Map<string, CellOutput>()));

      const totalExecutionTime = Date.now() - startTime;

      return {
        outputs,
        totalExecutionTime,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  /**
   * Interrupt execution (placeholder for future implementation)
   */
  static async interruptExecution(notebookId: string): Promise<void> {
    try {
      // TODO: Implement query cancellation when DuckDB supports it
      // For now, just log the request
      // eslint-disable-next-line no-console
      console.log(`Interrupt requested for notebook: ${notebookId}`);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  /**
   * Cleanup idle sessions
   */
  private static cleanupIdleSessions(): void {
    const now = Date.now();

    Array.from(this.sessions.entries()).forEach(([notebookId, session]) => {
      const idleTime = now - session.lastActivityAt.getTime();

      if (idleTime > this.SESSION_TIMEOUT_MS) {
        // eslint-disable-next-line no-console
        console.log(`Cleaning up idle session: ${notebookId}`);
        this.sessions.delete(notebookId);
      }
    });
  }

  /**
   * Get active session count (for monitoring)
   */
  static getActiveSessionCount(): number {
    return this.sessions.size;
  }
}
