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
const MAX_STORED_CELL_VALUE_CHARS = 2_000;

// Helper function to convert BigInt to string for JSON serialization
function bigIntReplacer(key: string, value: any): any {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

function limitStoredValue(value: any): any {
  if (typeof value === 'string' && value.length > MAX_STORED_CELL_VALUE_CHARS) {
    return `${value.slice(0, MAX_STORED_CELL_VALUE_CHARS)}... [truncated for notebook storage]`;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  return value;
}

// Helper function to limit data size in cell output
function limitCellOutputData(output: CellOutput): CellOutput {
  if (output.type === 'table' && output.data) {
    const limitedRows = output.data.slice(0, MAX_STORED_ROWS).map((row) => {
      if (!row || typeof row !== 'object') {
        return limitStoredValue(row);
      }

      return Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          limitStoredValue(value),
        ]),
      );
    });

    return {
      ...output,
      data: limitedRows,
      rowCount: Math.min(
        output.rowCount ?? limitedRows.length,
        MAX_STORED_ROWS,
      ),
      // Keep totalRows to show full count in UI
    };
  }
  return output;
}

// Validate and sanitize pagination inputs
const MAX_PAGE_LIMIT = 1000;

function sanitizePagination(
  limit?: number,
  offset?: number,
): { pageLimit: number; pageOffset: number } {
  const rawLimit = limit ?? 10;
  const rawOffset = offset ?? 0;

  if (!Number.isInteger(rawLimit) || rawLimit <= 0) {
    throw new Error('Invalid limit: must be a positive integer');
  }
  if (!Number.isInteger(rawOffset) || rawOffset < 0) {
    throw new Error('Invalid offset: must be a non-negative integer');
  }

  return {
    pageLimit: Math.min(rawLimit, MAX_PAGE_LIMIT),
    pageOffset: rawOffset,
  };
}

// Detect row-returning queries including WITH...SELECT
function isRowReturningQuery(query: string): boolean {
  // Match SELECT or WITH...SELECT patterns
  return /^\s*(?:WITH\b[\s\S]*?\)\s*)*SELECT\b/i.test(query.trim());
}

// Strip trailing LIMIT/OFFSET clauses to allow backend pagination to work deterministically
function removeTrailingLimit(query: string): string {
  let cleaned = query.trim().replace(/;$/, '').trim();
  const limitRegex = /\bLIMIT\s+\d+(?:\s+OFFSET\s+\d+)?\s*$/i;
  cleaned = cleaned.replace(limitRegex, '').trim();
  return cleaned;
}

// Ensure directories exist
async function ensureDirectories() {
  await fs.mkdir(NOTEBOOKS_DIR, { recursive: true });
  await fs.mkdir(ORPHANED_DIR, { recursive: true });
}

// Validate and sanitize path segments to prevent path traversal attacks
function assertSafeSegment(value: string, label: string): string {
  // Allow alphanumeric, colon, underscore, dash for connection keys
  // connectionKey format: "db:uuid" or "ducklake:uuid"
  if (!/^[A-Za-z0-9:_-]+$/.test(value)) {
    throw new Error(`Invalid ${label}: "${value}" contains unsafe characters`);
  }
  return value;
}

// Get notebook file path with security validation
function getNotebookPath(connectionKey: string, notebookId: string): string {
  let safeConnectionKey = assertSafeSegment(connectionKey, 'connection key');
  const safeNotebookId = assertSafeSegment(notebookId, 'notebook id');
  if (process.platform === 'win32') {
    safeConnectionKey = safeConnectionKey.replace(':', '_');
  }
  const filePath = path.resolve(
    NOTEBOOKS_DIR,
    safeConnectionKey,
    `${safeNotebookId}.json`,
  );
  const base = `${path.resolve(NOTEBOOKS_DIR)}${path.sep}`;
  if (!filePath.startsWith(base)) {
    throw new Error('Invalid notebook path - path traversal detected');
  }
  return filePath;
}

// Get connection directory path with security validation
function getConnectionDir(connectionKey: string): string {
  const safeConnectionKey = assertSafeSegment(connectionKey, 'connection key');
  let dirPath = path.resolve(NOTEBOOKS_DIR, safeConnectionKey);
  if (process.platform === 'win32') {
    const lastColonIndex = dirPath.lastIndexOf(':');
    if (lastColonIndex !== -1) {
      dirPath = `${dirPath.substring(0, lastColonIndex)}_${dirPath.substring(
        lastColonIndex + 1,
      )}`;
    }
  }
  const base = `${path.resolve(NOTEBOOKS_DIR)}${path.sep}`;
  if (!dirPath.startsWith(base)) {
    throw new Error('Invalid connection directory - path traversal detected');
  }
  return dirPath;
}

// Get archived connection directory path with security validation
function getArchivedConnectionDir(connectionKey: string): string {
  const safeKey = assertSafeSegment(connectionKey, 'archived connection key');
  const dirPath = path.resolve(ORPHANED_DIR, safeKey);
  const base = `${path.resolve(ORPHANED_DIR)}${path.sep}`;
  if (!dirPath.startsWith(base)) {
    throw new Error(
      'Invalid archived directory path - path traversal detected',
    );
  }
  return dirPath;
}

// Get archived notebook file path with security validation
function getArchivedNotebookPath(
  connectionKey: string,
  notebookId: string,
): string {
  const dir = getArchivedConnectionDir(connectionKey);
  const safeNotebookId = assertSafeSegment(notebookId, 'notebook id');
  const filePath = path.join(dir, `${safeNotebookId}.json`);
  const base = `${path.resolve(ORPHANED_DIR)}${path.sep}`;
  if (!filePath.startsWith(base)) {
    throw new Error('Invalid archived notebook path - path traversal detected');
  }
  return filePath;
}

async function readNotebookFile(filePath: string): Promise<Notebook> {
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content) as Notebook;
}

async function writeNotebookFile(
  filePath: string,
  notebook: Notebook,
): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const content = JSON.stringify(notebook, bigIntReplacer, 2);

  await fs.writeFile(tempPath, content, 'utf-8');
  await fs.rename(tempPath, filePath);
}

// Normalize connection ID to connectionKey format with input validation
function normalizeConnectionKey(connectionId: string): string {
  // Validate input before transformation
  if (!/^[A-Za-z0-9_-]+$/.test(connectionId)) {
    throw new Error(
      `Invalid connection ID: "${connectionId}" contains unsafe characters`,
    );
  }

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
            const notebook = await readNotebookFile(filePath);
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
        return await readNotebookFile(notebookPath);
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
      await writeNotebookFile(notebookPath, notebook);

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
      await writeNotebookFile(notebookPath, updatedNotebook);

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
      await writeNotebookFile(notebookPath, duplicatedNotebook);

      return duplicatedNotebook;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  /**
   * Select a notebook file to import
   */
  static async selectNotebookFile(): Promise<string | null> {
    try {
      // eslint-disable-next-line global-require
      const { dialog } = require('electron');

      const result = await dialog.showOpenDialog({
        title: 'Import Notebook',
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return result.filePaths[0];
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }

  /**
   * Import a notebook from JSON file
   * Supports both single notebook and bulk export formats
   */
  static async importNotebook(
    connectionId: string,
    filePath: string,
  ): Promise<Notebook> {
    try {
      // Read file
      const fileContent = await fs.readFile(filePath, 'utf-8');

      // Check file size
      const fileSizeInMB =
        Buffer.byteLength(fileContent, 'utf-8') / (1024 * 1024);
      if (fileSizeInMB > 50) {
        throw new Error(
          `File is too large (${fileSizeInMB.toFixed(1)}MB). Please re-export the notebook to get a smaller file without data.`,
        );
      }

      let importedData: any;
      try {
        importedData = JSON.parse(fileContent);
      } catch (parseError) {
        throw new Error(
          'Invalid JSON file - unable to parse. The file may be corrupted or too large.',
        );
      }

      // Validate structure - be lenient with validation
      if (!importedData) {
        throw new Error('Empty JSON file');
      }

      // Check if it's a bulk export format (multiple notebooks)
      const isBulkExport =
        Array.isArray(importedData.notebooks) &&
        importedData.notebooks.length > 0;

      if (isBulkExport) {
        // For bulk export, import the first notebook
        // eslint-disable-next-line no-console
        console.log(
          `Bulk export detected with ${importedData.notebooks.length} notebooks. Importing first notebook only.`,
        );

        if (importedData.notebooks.length > 1) {
          // eslint-disable-next-line no-console
          console.warn(
            `Note: This file contains ${importedData.notebooks.length} notebooks. Only the first one will be imported. Use "Import All Notebooks" for bulk import.`,
          );
        }

        [importedData] = importedData.notebooks;
      }

      // Check if it's a valid notebook structure
      const hasName =
        typeof importedData.name === 'string' && importedData.name.trim();
      const hasCells = Array.isArray(importedData.cells);

      if (!hasName || !hasCells) {
        // eslint-disable-next-line no-console
        console.error('Invalid notebook structure:', {
          hasName,
          hasCells,
          keys: Object.keys(importedData),
        });
        throw new Error(
          'Invalid notebook structure - missing name or cells array',
        );
      }

      await ensureDirectories();
      const connectionKey = normalizeConnectionKey(connectionId);
      const connectionDir = getConnectionDir(connectionKey);

      // Ensure connection directory exists
      await fs.mkdir(connectionDir, { recursive: true });

      // Generate new IDs and clear outputs
      const now = new Date().toISOString();
      const newNotebook: Notebook = {
        id: uuidv4(), // New notebook ID
        name: importedData.name.trim(),
        description: importedData.description || undefined,
        cells: importedData.cells.map((cell: any, index: number) => ({
          id: uuidv4(), // New cell ID
          type: cell.type || 'sql',
          content: cell.content || '',
          order: index,
          // Always clear outputs on import (ignore any data in JSON)
          output: undefined,
        })),
        createdAt: now,
        updatedAt: now,
        cellCount: importedData.cells.length,
      };

      const notebookPath = getNotebookPath(connectionKey, newNotebook.id);
      await writeNotebookFile(notebookPath, newNotebook);

      return newNotebook;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Import error:', error);
      throw new Error(
        `Failed to import notebook: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Import all notebooks from a bulk export JSON file
   */
  static async importAllNotebooks(
    connectionId: string,
    filePath: string,
  ): Promise<Notebook[]> {
    try {
      // Read file
      const fileContent = await fs.readFile(filePath, 'utf-8');

      // Check file size
      const fileSizeInMB =
        Buffer.byteLength(fileContent, 'utf-8') / (1024 * 1024);
      if (fileSizeInMB > 100) {
        throw new Error(
          `File is too large (${fileSizeInMB.toFixed(1)}MB). Maximum size is 100MB.`,
        );
      }

      let importedData: any;
      try {
        importedData = JSON.parse(fileContent);
      } catch (parseError) {
        throw new Error(
          'Invalid JSON file - unable to parse. The file may be corrupted or too large.',
        );
      }

      if (!importedData) {
        throw new Error('Empty JSON file');
      }

      // Check if it's a bulk export format
      const isBulkExport =
        Array.isArray(importedData.notebooks) &&
        importedData.notebooks.length > 0;

      if (!isBulkExport) {
        // Single notebook - import it as an array with one item
        const singleNotebook = await this.importNotebook(
          connectionId,
          filePath,
        );
        return [singleNotebook];
      }

      await ensureDirectories();
      const connectionKey = normalizeConnectionKey(connectionId);
      const connectionDir = getConnectionDir(connectionKey);

      // Ensure connection directory exists
      await fs.mkdir(connectionDir, { recursive: true });

      const now = new Date().toISOString();

      // Import all notebooks
      const validNotebooks = importedData.notebooks.filter(
        (notebookData: any) => {
          const hasName =
            typeof notebookData.name === 'string' && notebookData.name.trim();
          const hasCells = Array.isArray(notebookData.cells);

          if (!hasName || !hasCells) {
            // eslint-disable-next-line no-console
            console.warn(
              `Skipping invalid notebook: ${notebookData.name || 'unnamed'}`,
            );
            return false;
          }
          return true;
        },
      );

      const importedNotebooks = await Promise.all(
        validNotebooks.map(async (notebookData: any) => {
          // Generate new IDs and clear outputs
          const newNotebook: Notebook = {
            id: uuidv4(), // New notebook ID
            name: notebookData.name.trim(),
            description: notebookData.description || undefined,
            cells: notebookData.cells.map((cell: any, index: number) => ({
              id: uuidv4(), // New cell ID
              type: cell.type || 'sql',
              content: cell.content || '',
              order: index,
              // Always clear outputs on import
              output: undefined,
            })),
            createdAt: now,
            updatedAt: now,
            cellCount: notebookData.cells.length,
          };

          const notebookPath = getNotebookPath(connectionKey, newNotebook.id);
          await writeNotebookFile(notebookPath, newNotebook);

          return newNotebook;
        }),
      );

      if (importedNotebooks.length === 0) {
        throw new Error('No valid notebooks found in the import file');
      }

      return importedNotebooks;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Import all error:', error);
      throw new Error(
        `Failed to import notebooks: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
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

      // Validate and sanitize pagination inputs
      const { pageLimit, pageOffset } = sanitizePagination(limit, offset);

      // Strip any explicit LIMIT/OFFSET to avoid syntax errors when we append ours
      const processedSql = removeTrailingLimit(sql);

      // Detect query type - includes WITH...SELECT and other row-returning queries
      const isSelect = isRowReturningQuery(processedSql);

      let result: any;
      let totalRows: number | undefined;

      // Execute query based on connection type
      if (connectionId.startsWith('ducklake-')) {
        const instanceId = connectionId.replace('ducklake-', '');

        // DuckLake supports native pagination
        result = await DuckLakeService.executeQuery({
          instanceId,
          query: processedSql,
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
            const countQuery = `SELECT COUNT(*) as count FROM (${processedSql.trim().replace(/;$/, '')}) as subquery`;
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
        let queryToExecute = processedSql;

        // Manually append LIMIT/OFFSET for SELECT queries
        if (isSelect) {
          queryToExecute = `${processedSql.trim().replace(/;$/, '')} LIMIT ${pageLimit} OFFSET ${pageOffset}`;
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
            const countQuery = `SELECT COUNT(*) as count FROM (${processedSql.trim().replace(/;$/, '')}) as subquery`;
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

      // Validate and sanitize pagination inputs
      const { pageLimit, pageOffset } = sanitizePagination(limit, offset);

      // Detect query type - includes WITH...SELECT and other row-returning queries
      const processedSql = removeTrailingLimit(sql);
      const isSelect = isRowReturningQuery(processedSql);

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
          query: processedSql,
          limit: pageLimit,
          offset: pageOffset,
        });

        // Get total row count
        if (result.success && result.data) {
          try {
            const countQuery = `SELECT COUNT(*) as count FROM (${processedSql.trim().replace(/;$/, '')}) as subquery`;
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
        // Regular DB connection - manually append LIMIT/OFFSET with sanitized values
        const queryToExecute = `${processedSql.trim().replace(/;$/, '')} LIMIT ${pageLimit} OFFSET ${pageOffset}`;

        result = await ConnectorsService.executeQueryForConnection({
          connectionId,
          query: queryToExecute,
        });

        // Get total row count
        if (result.success && result.data) {
          try {
            const countQuery = `SELECT COUNT(*) as count FROM (${processedSql.trim().replace(/;$/, '')}) as subquery`;
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

      // Get the current notebook state after all cells have been executed
      const updatedNotebook = await this.getNotebook(connectionId, notebookId);
      if (updatedNotebook) {
        const now = new Date().toISOString();
        updatedNotebook.lastExecutedAt = now;
        updatedNotebook.updatedAt = now;
        const connectionKey = normalizeConnectionKey(connectionId);
        const notebookPath = getNotebookPath(connectionKey, notebookId);
        await writeNotebookFile(notebookPath, updatedNotebook);
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

        // Read all notebooks and clear their output data before archiving
        const files = await fs.readdir(connectionDir);
        const jsonFiles = files.filter((file) => file.endsWith('.json'));

        // Clean all notebooks in parallel
        await Promise.all(
          jsonFiles.map(async (file) => {
            try {
              const filePath = path.join(connectionDir, file);
              const notebook = await readNotebookFile(filePath);

              // Clear output data from all cells
              notebook.cells = notebook.cells.map((cell) => ({
                ...cell,
                output: cell.output
                  ? {
                      type: cell.output.type,
                      columns: cell.output.columns,
                      rowCount: cell.output.rowCount,
                      totalRows: cell.output.totalRows,
                      executionTime: cell.output.executionTime,
                      error: cell.output.error,
                      // Explicitly exclude 'data' array
                    }
                  : undefined,
              }));

              // Write back the cleaned notebook
              await writeNotebookFile(filePath, notebook);
            } catch (error) {
              // eslint-disable-next-line no-console
              console.error(
                `Failed to clean notebook ${file} before archiving:`,
                error,
              );
              // Continue with archiving even if cleaning fails
            }
          }),
        );

        // Move directory to orphaned
        await fs.rename(connectionDir, orphanedDir);
      } catch (error: any) {
        // Only suppress missing directory errors (ENOENT)
        if (error?.code !== 'ENOENT') {
          throw error;
        }
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
                  const notebook = await readNotebookFile(filePath);
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
      const archivedPath = getArchivedNotebookPath(
        archivedConnectionKey,
        notebookId,
      );
      const notebook = await readNotebookFile(archivedPath);

      // Ensure target connection directory exists
      const targetDir = getConnectionDir(targetConnectionKey);
      await fs.mkdir(targetDir, { recursive: true });

      // Write to target location
      const targetPath = getNotebookPath(targetConnectionKey, notebookId);
      await writeNotebookFile(targetPath, notebook);

      // Delete from archived location
      await fs.unlink(archivedPath);

      // Clean up empty archived connection directory
      try {
        const archivedDir = getArchivedConnectionDir(archivedConnectionKey);
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
      const archivedPath = getArchivedNotebookPath(connectionKey, notebookId);
      await fs.unlink(archivedPath);

      // Clean up empty archived connection directory
      try {
        const archivedDir = getArchivedConnectionDir(connectionKey);
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
        const archivedDir = getArchivedConnectionDir(connectionKey);
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
            const dir = getArchivedConnectionDir(key);
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
