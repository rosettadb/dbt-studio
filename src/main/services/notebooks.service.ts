/**
 * Notebooks Backend Service
 * Manages notebook storage and operations
 * Storage: JSON files in userData/notebooks/ directory, scoped by connectionKey
 */

import { app } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Notebook, NotebookCell, CellOutput } from '../../types/notebooks';
import ConnectorsService from './connectors.service';
import DuckLakeService from './duckLake.service';

const NOTEBOOKS_DIR = path.join(app.getPath('userData'), 'notebooks');
const ORPHANED_DIR = path.join(NOTEBOOKS_DIR, '_orphaned');

// Maximum rows to store in notebook output (prevent massive files)
const MAX_STORED_ROWS = 100;

// Helper function to convert BigInt to string for JSON serialization
function bigIntReplacer(key: string, value: any): any {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

// Helper function to limit data size in cell output
function limitCellOutputData(output: CellOutput): CellOutput {
  if (
    output.type === 'table' &&
    output.data &&
    output.data.length > MAX_STORED_ROWS
  ) {
    return {
      ...output,
      data: output.data.slice(0, MAX_STORED_ROWS),
      rowCount: MAX_STORED_ROWS,
      // Keep totalRows to show full count in UI
    };
  }
  return output;
}

// Ensure directories exist
async function ensureDirectories() {
  await fs.mkdir(NOTEBOOKS_DIR, { recursive: true });
  await fs.mkdir(ORPHANED_DIR, { recursive: true });
}

// Get notebook file path
function getNotebookPath(connectionKey: string, notebookId: string): string {
  return path.join(NOTEBOOKS_DIR, connectionKey, `${notebookId}.json`);
}

// Get connection directory path
function getConnectionDir(connectionKey: string): string {
  return path.join(NOTEBOOKS_DIR, connectionKey);
}

// Normalize connection ID to connectionKey format
function normalizeConnectionKey(connectionId: string): string {
  if (connectionId.startsWith('ducklake-')) {
    const instanceId = connectionId.replace('ducklake-', '');
    return `ducklake:${instanceId}`;
  }
  return `db:${connectionId}`;
}

export class NotebooksService {
  /**
   * List all notebooks for a connection
   */
  static async listNotebooks(connectionId: string): Promise<Notebook[]> {
    try {
      await ensureDirectories();
      const connectionKey = normalizeConnectionKey(connectionId);
      const connectionDir = getConnectionDir(connectionKey);

      try {
        await fs.access(connectionDir);
      } catch {
        // Directory doesn't exist, return empty array
        return [];
      }

      const files = await fs.readdir(connectionDir);
      const notebooks: Notebook[] = [];

      // eslint-disable-next-line no-restricted-syntax
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(connectionDir, file);
            // eslint-disable-next-line no-await-in-loop
            const content = await fs.readFile(filePath, 'utf-8');
            const notebook = JSON.parse(content) as Notebook;
            notebooks.push(notebook);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error(`Failed to read notebook ${file}:`, error);
          }
        }
      }

      return notebooks.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  /**
   * Get a specific notebook
   */
  static async getNotebook(
    connectionId: string,
    notebookId: string,
  ): Promise<Notebook | null> {
    try {
      const connectionKey = normalizeConnectionKey(connectionId);
      const notebookPath = getNotebookPath(connectionKey, notebookId);

      try {
        const content = await fs.readFile(notebookPath, 'utf-8');
        return JSON.parse(content) as Notebook;
      } catch {
        return null;
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  /**
   * Create a new notebook
   */
  static async createNotebook(
    connectionId: string,
    name: string,
    description?: string,
  ): Promise<Notebook> {
    try {
      await ensureDirectories();
      const connectionKey = normalizeConnectionKey(connectionId);
      const connectionDir = getConnectionDir(connectionKey);

      // Ensure connection directory exists
      await fs.mkdir(connectionDir, { recursive: true });

      const now = new Date().toISOString();
      const notebook: Notebook = {
        id: uuidv4(),
        name,
        description,
        cells: [],
        createdAt: now,
        updatedAt: now,
        cellCount: 0,
      };

      const notebookPath = getNotebookPath(connectionKey, notebook.id);
      await fs.writeFile(
        notebookPath,
        JSON.stringify(notebook, bigIntReplacer, 2),
      );

      return notebook;
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
    connectionId: string,
    notebookId: string,
    updates: {
      name?: string;
      description?: string;
      cells?: NotebookCell[];
    },
  ): Promise<Notebook> {
    try {
      const connectionKey = normalizeConnectionKey(connectionId);
      const notebook = await this.getNotebook(connectionId, notebookId);

      if (!notebook) {
        throw new Error(`Notebook ${notebookId} not found`);
      }

      // Only include defined properties in the update
      const updatedNotebook: Notebook = {
        ...notebook,
        ...(updates.name !== undefined && { name: updates.name }),
        ...(updates.description !== undefined && {
          description: updates.description,
        }),
        ...(updates.cells !== undefined && { cells: updates.cells }),
        updatedAt: new Date().toISOString(),
        cellCount: updates.cells?.length ?? notebook.cellCount,
      };

      const notebookPath = getNotebookPath(connectionKey, notebookId);
      await fs.writeFile(
        notebookPath,
        JSON.stringify(updatedNotebook, bigIntReplacer, 2),
      );

      return updatedNotebook;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  /**
   * Rename a notebook
   */
  static async renameNotebook(
    connectionId: string,
    notebookId: string,
    newName: string,
  ): Promise<Notebook> {
    try {
      return await this.updateNotebook(connectionId, notebookId, {
        name: newName,
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  /**
   * Duplicate a notebook
   */
  static async duplicateNotebook(
    connectionId: string,
    notebookId: string,
    newName?: string,
  ): Promise<Notebook> {
    try {
      await ensureDirectories();
      const connectionKey = normalizeConnectionKey(connectionId);
      const originalNotebook = await this.getNotebook(connectionId, notebookId);

      if (!originalNotebook) {
        throw new Error(`Notebook ${notebookId} not found`);
      }

      const now = new Date().toISOString();
      const duplicatedNotebook: Notebook = {
        ...originalNotebook,
        id: uuidv4(),
        name: newName || `${originalNotebook.name} (Copy)`,
        createdAt: now,
        updatedAt: now,
        // Reset cell outputs for duplicated notebook
        cells: originalNotebook.cells.map((cell) => ({
          ...cell,
          id: uuidv4(), // Generate new IDs for cells
          output: undefined,
        })),
      };

      const notebookPath = getNotebookPath(
        connectionKey,
        duplicatedNotebook.id,
      );
      await fs.writeFile(
        notebookPath,
        JSON.stringify(duplicatedNotebook, bigIntReplacer, 2),
      );

      return duplicatedNotebook;
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
    connectionId: string,
    notebookId: string,
  ): Promise<void> {
    try {
      const connectionKey = normalizeConnectionKey(connectionId);
      const notebookPath = getNotebookPath(connectionKey, notebookId);

      await fs.unlink(notebookPath);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  /**
   * Run a single SQL cell
   */
  static async runCell(
    connectionId: string,
    notebookId: string,
    cellId: string,
    sql: string,
    limit?: number,
    offset?: number,
  ): Promise<CellOutput> {
    try {
      const startTime = Date.now();

      // Default pagination values
      const pageLimit = limit ?? 10;
      const pageOffset = offset ?? 0;

      // Detect query type
      const isSelectQuery = (query: string): boolean => {
        const normalized = query.trim().toUpperCase();
        return normalized.startsWith('SELECT') || normalized.startsWith('WITH');
      };

      const isSelect = isSelectQuery(sql);

      let result: any;
      let totalRows: number | undefined;

      // Execute query based on connection type
      if (connectionId.startsWith('ducklake-')) {
        const instanceId = connectionId.replace('ducklake-', '');

        // DuckLake supports native pagination
        result = await DuckLakeService.executeQuery({
          instanceId,
          query: sql,
          limit: isSelect ? pageLimit : undefined,
          offset: isSelect ? pageOffset : undefined,
        });

        // Get total row count for SELECT queries
        if (
          isSelect &&
          result.success &&
          result.data &&
          result.data.length > 0
        ) {
          try {
            const countQuery = `SELECT COUNT(*) as count FROM (${sql.trim().replace(/;$/, '')}) as subquery`;
            const countResult = await DuckLakeService.executeQuery({
              instanceId,
              query: countQuery,
            });
            const countValue = countResult.data?.[0]?.count;
            totalRows =
              typeof countValue === 'bigint'
                ? Number(countValue)
                : (countValue ?? result.rowCount);
          } catch (countError) {
            // If count fails, use rowCount from result
            totalRows = result.rowCount;
          }
        }
      } else {
        // Regular DB connection
        let queryToExecute = sql;

        // Manually append LIMIT/OFFSET for SELECT queries
        if (isSelect) {
          queryToExecute = `${sql.trim().replace(/;$/, '')} LIMIT ${pageLimit} OFFSET ${pageOffset}`;
        }

        result = await ConnectorsService.executeQueryForConnection({
          connectionId,
          query: queryToExecute,
        });

        // Get total row count for SELECT queries
        if (
          isSelect &&
          result.success &&
          result.data &&
          result.data.length > 0
        ) {
          try {
            const countQuery = `SELECT COUNT(*) as count FROM (${sql.trim().replace(/;$/, '')}) as subquery`;
            const countResult =
              await ConnectorsService.executeQueryForConnection({
                connectionId,
                query: countQuery,
              });
            const countValue = (countResult.data?.[0] as any)?.count;
            totalRows =
              typeof countValue === 'bigint'
                ? Number(countValue)
                : (countValue ?? result.rowCount);
          } catch (countError) {
            // If count fails, use rowCount from result
            totalRows = result.rowCount;
          }
        }
      }

      const executionTime = Date.now() - startTime;

      // Handle error
      if (result.error || !result.success) {
        const output: CellOutput = {
          type: 'error',
          error: result.error || 'Query execution failed',
          executionTime,
        };

        // Update cell with error output
        await this.updateCellOutput(connectionId, notebookId, cellId, output);
        return output;
      }

      // Handle empty result
      if (!result.data || result.data.length === 0) {
        const output: CellOutput = {
          type: 'empty',
          executionTime,
          rowCount: 0,
          totalRows: isSelect ? totalRows : undefined,
        };

        await this.updateCellOutput(connectionId, notebookId, cellId, output);
        return output;
      }

      // Handle table result
      const columns = result.fields
        ? result.fields.map((f: any) => f.name)
        : Object.keys(result.data[0]);

      const output: CellOutput = {
        type: 'table',
        data: result.data,
        columns,
        rowCount: result.data.length,
        totalRows: isSelect ? totalRows : undefined,
        executionTime,
      };

      // Update cell with output
      await this.updateCellOutput(connectionId, notebookId, cellId, output);
      return output;
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error(error);

      const output: CellOutput = {
        type: 'error',
        error: error.message || 'Unknown error',
        executionTime: 0,
      };

      await this.updateCellOutput(connectionId, notebookId, cellId, output);
      return output;
    }
  }

  /**
   * Fetch a specific page of results for a cell without updating notebook storage
   * Used for pagination without re-executing/saving
   */
  static async fetchCellPage(
    connectionId: string,
    notebookId: string,
    cellId: string,
    sql: string,
    limit: number,
    offset: number,
  ): Promise<CellOutput> {
    try {
      const startTime = Date.now();

      // Detect query type
      const isSelectQuery = (query: string): boolean => {
        const normalized = query.trim().toUpperCase();
        return normalized.startsWith('SELECT') || normalized.startsWith('WITH');
      };

      const isSelect = isSelectQuery(sql);

      // Only paginate SELECT queries
      if (!isSelect) {
        return {
          type: 'error',
          error: 'Pagination is only supported for SELECT queries',
          executionTime: 0,
        };
      }

      let result: any;
      let totalRows: number | undefined;

      // Execute query based on connection type
      if (connectionId.startsWith('ducklake-')) {
        const instanceId = connectionId.replace('ducklake-', '');

        // DuckLake supports native pagination
        result = await DuckLakeService.executeQuery({
          instanceId,
          query: sql,
          limit,
          offset,
        });

        // Get total row count
        if (result.success && result.data) {
          try {
            const countQuery = `SELECT COUNT(*) as count FROM (${sql.trim().replace(/;$/, '')}) as subquery`;
            const countResult = await DuckLakeService.executeQuery({
              instanceId,
              query: countQuery,
            });
            const countValue = countResult.data?.[0]?.count;
            totalRows =
              typeof countValue === 'bigint'
                ? Number(countValue)
                : (countValue ?? result.rowCount);
          } catch (countError) {
            totalRows = result.rowCount;
          }
        }
      } else {
        // Regular DB connection - manually append LIMIT/OFFSET
        const queryToExecute = `${sql.trim().replace(/;$/, '')} LIMIT ${limit} OFFSET ${offset}`;

        result = await ConnectorsService.executeQueryForConnection({
          connectionId,
          query: queryToExecute,
        });

        // Get total row count
        if (result.success && result.data) {
          try {
            const countQuery = `SELECT COUNT(*) as count FROM (${sql.trim().replace(/;$/, '')}) as subquery`;
            const countResult =
              await ConnectorsService.executeQueryForConnection({
                connectionId,
                query: countQuery,
              });
            const countValue = (countResult.data?.[0] as any)?.count;
            totalRows =
              typeof countValue === 'bigint'
                ? Number(countValue)
                : (countValue ?? result.rowCount);
          } catch (countError) {
            totalRows = result.rowCount;
          }
        }
      }

      const executionTime = Date.now() - startTime;

      // Handle error
      if (result.error || !result.success) {
        return {
          type: 'error',
          error: result.error || 'Query execution failed',
          executionTime,
        };
      }

      // Handle empty result
      if (!result.data || result.data.length === 0) {
        return {
          type: 'empty',
          executionTime,
          rowCount: 0,
          totalRows,
        };
      }

      // Handle table result
      const columns = result.fields
        ? result.fields.map((f: any) => f.name)
        : Object.keys(result.data[0]);

      return {
        type: 'table',
        data: result.data,
        columns,
        rowCount: result.data.length,
        totalRows,
        executionTime,
      };
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error(error);

      return {
        type: 'error',
        error: error.message || 'Unknown error',
        executionTime: 0,
      };
    }
  }

  /**
   * Run all SQL cells in a notebook
   */
  static async runAllCells(
    connectionId: string,
    notebookId: string,
  ): Promise<void> {
    try {
      const notebook = await this.getNotebook(connectionId, notebookId);
      if (!notebook) {
        throw new Error(`Notebook ${notebookId} not found`);
      }

      // Run SQL cells sequentially
      // eslint-disable-next-line no-restricted-syntax
      for (const cell of notebook.cells.sort((a, b) => a.order - b.order)) {
        if (cell.type === 'sql' && cell.content.trim()) {
          // eslint-disable-next-line no-await-in-loop
          await this.runCell(connectionId, notebookId, cell.id, cell.content);
        }
      }

      // Update lastExecutedAt
      await this.updateNotebook(connectionId, notebookId, {
        ...notebook,
      });

      const updatedNotebook = await this.getNotebook(connectionId, notebookId);
      if (updatedNotebook) {
        updatedNotebook.lastExecutedAt = new Date().toISOString();
        const connectionKey = normalizeConnectionKey(connectionId);
        const notebookPath = getNotebookPath(connectionKey, notebookId);
        await fs.writeFile(
          notebookPath,
          JSON.stringify(updatedNotebook, bigIntReplacer, 2),
        );
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  /**
   * Update cell output in notebook
   */
  private static async updateCellOutput(
    connectionId: string,
    notebookId: string,
    cellId: string,
    output: CellOutput,
  ): Promise<void> {
    try {
      const notebook = await this.getNotebook(connectionId, notebookId);
      if (!notebook) return;

      // Limit output data size to prevent massive files
      const limitedOutput = limitCellOutputData(output);

      const updatedCells = notebook.cells.map((cell) =>
        cell.id === cellId ? { ...cell, output: limitedOutput } : cell,
      );

      await this.updateNotebook(connectionId, notebookId, {
        cells: updatedCells,
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
    }
  }

  /**
   * Archive notebooks for a deleted connection
   */
  static async archiveConnectionNotebooks(connectionId: string): Promise<void> {
    try {
      await ensureDirectories();
      const connectionKey = normalizeConnectionKey(connectionId);
      const connectionDir = getConnectionDir(connectionKey);
      const orphanedDir = path.join(ORPHANED_DIR, connectionKey);

      try {
        await fs.access(connectionDir);
        // Move directory to orphaned
        await fs.rename(connectionDir, orphanedDir);
      } catch {
        // Directory doesn't exist, nothing to archive
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  /**
   * List all archived notebooks grouped by connectionKey
   */
  static async listArchivedNotebooks(): Promise<Record<string, Notebook[]>> {
    try {
      await ensureDirectories();
      const archivedByConnection: Record<string, Notebook[]> = {};

      try {
        const connectionKeys = await fs.readdir(ORPHANED_DIR);

        // eslint-disable-next-line no-restricted-syntax
        for (const connectionKey of connectionKeys) {
          const connectionDir = path.join(ORPHANED_DIR, connectionKey);
          // eslint-disable-next-line no-await-in-loop
          const stat = await fs.stat(connectionDir);

          if (stat.isDirectory()) {
            // eslint-disable-next-line no-await-in-loop
            const files = await fs.readdir(connectionDir);
            const notebooks: Notebook[] = [];

            // eslint-disable-next-line no-restricted-syntax
            for (const file of files) {
              if (file.endsWith('.json')) {
                try {
                  const filePath = path.join(connectionDir, file);
                  // eslint-disable-next-line no-await-in-loop
                  const content = await fs.readFile(filePath, 'utf-8');
                  const notebook = JSON.parse(content) as Notebook;
                  notebooks.push(notebook);
                } catch (error) {
                  // eslint-disable-next-line no-console
                  console.error(
                    `Failed to read archived notebook ${file}:`,
                    error,
                  );
                }
              }
            }

            if (notebooks.length > 0) {
              archivedByConnection[connectionKey] = notebooks.sort(
                (a, b) =>
                  new Date(b.updatedAt).getTime() -
                  new Date(a.updatedAt).getTime(),
              );
            }
          }
        }
      } catch {
        // Orphaned directory doesn't exist or is empty
      }

      return archivedByConnection;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  /**
   * Restore an archived notebook to an active connection
   */
  static async restoreNotebook(
    archivedConnectionKey: string,
    notebookId: string,
    targetConnectionId: string,
  ): Promise<Notebook> {
    try {
      await ensureDirectories();
      const targetConnectionKey = normalizeConnectionKey(targetConnectionId);

      // Read archived notebook
      const archivedPath = path.join(
        ORPHANED_DIR,
        archivedConnectionKey,
        `${notebookId}.json`,
      );
      const content = await fs.readFile(archivedPath, 'utf-8');
      const notebook = JSON.parse(content) as Notebook;

      // Ensure target connection directory exists
      const targetDir = getConnectionDir(targetConnectionKey);
      await fs.mkdir(targetDir, { recursive: true });

      // Write to target location
      const targetPath = getNotebookPath(targetConnectionKey, notebookId);
      await fs.writeFile(
        targetPath,
        JSON.stringify(notebook, bigIntReplacer, 2),
      );

      // Delete from archived location
      await fs.unlink(archivedPath);

      // Clean up empty archived connection directory
      try {
        const archivedDir = path.join(ORPHANED_DIR, archivedConnectionKey);
        const remainingFiles = await fs.readdir(archivedDir);
        if (remainingFiles.length === 0) {
          await fs.rmdir(archivedDir);
        }
      } catch {
        // Ignore cleanup errors
      }

      return notebook;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  /**
   * Permanently delete an archived notebook
   */
  static async deleteArchivedNotebook(
    connectionKey: string,
    notebookId: string,
  ): Promise<void> {
    try {
      const archivedPath = path.join(
        ORPHANED_DIR,
        connectionKey,
        `${notebookId}.json`,
      );
      await fs.unlink(archivedPath);

      // Clean up empty archived connection directory
      try {
        const archivedDir = path.join(ORPHANED_DIR, connectionKey);
        const remainingFiles = await fs.readdir(archivedDir);
        if (remainingFiles.length === 0) {
          await fs.rmdir(archivedDir);
        }
      } catch {
        // Ignore cleanup errors
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  /**
   * Delete all archived notebooks (optionally for a specific connection)
   */
  static async deleteAllArchivedNotebooks(
    connectionKey?: string,
  ): Promise<void> {
    try {
      await ensureDirectories();

      if (connectionKey) {
        // Delete all notebooks for specific connection
        const archivedDir = path.join(ORPHANED_DIR, connectionKey);
        try {
          await fs.rm(archivedDir, { recursive: true, force: true });
        } catch {
          // Directory doesn't exist, nothing to delete
        }
      } else {
        // Delete all archived notebooks
        try {
          const connectionKeys = await fs.readdir(ORPHANED_DIR);
          // eslint-disable-next-line no-restricted-syntax
          for (const key of connectionKeys) {
            const dir = path.join(ORPHANED_DIR, key);
            // eslint-disable-next-line no-await-in-loop
            await fs.rm(dir, { recursive: true, force: true });
          }
        } catch {
          // Directory doesn't exist or is empty
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }
}
