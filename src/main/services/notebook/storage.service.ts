/**
 * Notebook Storage Service
 * Handles persistence of notebooks and outputs to filesystem
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { app } from 'electron';
import {
  Notebook,
  NotebookData,
  NotebookListItem,
  CellOutput,
} from '../../../types/notebook';
import { NotebookNotFoundError } from '../../errors/NotebookError';

export class NotebookStorageService {
  private static getDataLakeDir(): string {
    return path.join(app.getPath('userData'), 'datalake');
  }

  private static getInstanceNotebooksDir(instanceId: string): string {
    return path.join(this.getDataLakeDir(), instanceId, 'notebooks');
  }

  private static getNotebookDir(
    instanceId: string,
    notebookId: string,
  ): string {
    return path.join(this.getInstanceNotebooksDir(instanceId), notebookId);
  }

  private static getNotebookFilePath(
    instanceId: string,
    notebookId: string,
  ): string {
    return path.join(
      this.getNotebookDir(instanceId, notebookId),
      'notebook.json',
    );
  }

  private static getOutputsDir(instanceId: string, notebookId: string): string {
    return path.join(this.getNotebookDir(instanceId, notebookId), 'outputs');
  }

  private static getCellOutputPath(
    instanceId: string,
    notebookId: string,
    cellId: string,
  ): string {
    return path.join(
      this.getOutputsDir(instanceId, notebookId),
      `${cellId}.json`,
    );
  }

  /**
   * Save notebook to disk
   */
  static async saveNotebook(notebook: Notebook): Promise<void> {
    try {
      const notebookDir = this.getNotebookDir(notebook.instanceId, notebook.id);
      await fs.ensureDir(notebookDir);

      const notebookData: NotebookData = {
        id: notebook.id,
        instanceId: notebook.instanceId,
        name: notebook.name,
        description: notebook.description,
        cells: notebook.cells.map((cell) => ({
          ...cell,
          output: undefined, // Outputs stored separately
        })),
        createdAt: notebook.createdAt.toISOString(),
        updatedAt: notebook.updatedAt.toISOString(),
        lastExecutedAt: notebook.lastExecutedAt?.toISOString(),
      };

      const filePath = this.getNotebookFilePath(
        notebook.instanceId,
        notebook.id,
      );
      await fs.writeJson(filePath, notebookData, { spaces: 2 });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw new Error(`Failed to save notebook: ${error}`);
    }
  }

  /**
   * Load notebook from disk
   */
  static async loadNotebook(
    instanceId: string,
    notebookId: string,
  ): Promise<Notebook> {
    try {
      const filePath = this.getNotebookFilePath(instanceId, notebookId);

      // eslint-disable-next-line no-console
      console.log('[NotebookStorage] Loading notebook:', {
        instanceId,
        notebookId,
        filePath,
      });

      if (!(await fs.pathExists(filePath))) {
        // eslint-disable-next-line no-console
        console.error('[NotebookStorage] Notebook file not found:', filePath);
        throw new NotebookNotFoundError(notebookId);
      }

      const data: NotebookData = await fs.readJson(filePath);

      // Load outputs for each cell
      const cellsWithOutputs = await Promise.all(
        data.cells.map(async (cell) => {
          const output = await this.loadCellOutput(
            instanceId,
            notebookId,
            cell.id,
          );
          return { ...cell, output };
        }),
      );

      return {
        id: data.id,
        instanceId: data.instanceId,
        name: data.name,
        description: data.description,
        cells: cellsWithOutputs,
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
        lastExecutedAt: data.lastExecutedAt
          ? new Date(data.lastExecutedAt)
          : undefined,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      if (error instanceof NotebookNotFoundError) {
        throw error;
      }
      throw new Error(`Failed to load notebook: ${error}`);
    }
  }

  /**
   * List all notebooks for an instance
   */
  static async listNotebooks(instanceId: string): Promise<NotebookListItem[]> {
    try {
      const notebooksDir = this.getInstanceNotebooksDir(instanceId);

      if (!(await fs.pathExists(notebooksDir))) {
        return [];
      }

      const notebookDirs = await fs.readdir(notebooksDir);

      // Load all notebooks in parallel
      const notebooksData = await Promise.all(
        notebookDirs.map(async (notebookId) => {
          const filePath = this.getNotebookFilePath(instanceId, notebookId);

          if (await fs.pathExists(filePath)) {
            const data: NotebookData = await fs.readJson(filePath);
            const notebook: NotebookListItem = {
              id: data.id,
              instanceId: data.instanceId,
              name: data.name,
              description: data.description,
              cellCount: data.cells.length,
              createdAt: new Date(data.createdAt),
              updatedAt: new Date(data.updatedAt),
              lastExecutedAt: data.lastExecutedAt
                ? new Date(data.lastExecutedAt)
                : undefined,
            };
            return notebook;
          }
          return null;
        }),
      );

      // Filter out null values
      const notebooks = notebooksData.filter(
        (notebook): notebook is NotebookListItem => notebook !== null,
      );

      // Sort by updatedAt descending
      return notebooks.sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw new Error(`Failed to list notebooks: ${error}`);
    }
  }

  /**
   * Delete notebook from disk
   */
  static async deleteNotebook(
    instanceId: string,
    notebookId: string,
  ): Promise<void> {
    try {
      const notebookDir = this.getNotebookDir(instanceId, notebookId);

      if (await fs.pathExists(notebookDir)) {
        await fs.remove(notebookDir);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw new Error(`Failed to delete notebook: ${error}`);
    }
  }

  /**
   * Custom JSON replacer to handle BigInt values
   */
  private static bigIntReplacer(_key: string, value: any): any {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return value;
  }

  /**
   * Convert BigInt values in nested objects/arrays
   */
  private static convertBigInts(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'bigint') {
      return obj.toString();
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.convertBigInts(item));
    }

    if (typeof obj === 'object') {
      return Object.entries(obj).reduce((acc, [key, value]) => {
        acc[key] = this.convertBigInts(value);
        return acc;
      }, {} as any);
    }

    return obj;
  }

  /**
   * Save cell output to disk
   */
  static async saveCellOutput(
    instanceId: string,
    notebookId: string,
    cellId: string,
    output: CellOutput,
  ): Promise<void> {
    try {
      const outputsDir = this.getOutputsDir(instanceId, notebookId);
      await fs.ensureDir(outputsDir);

      // Convert BigInt values to strings before serialization
      const sanitizedOutput = this.convertBigInts(output);

      const outputPath = this.getCellOutputPath(instanceId, notebookId, cellId);
      await fs.writeJson(outputPath, sanitizedOutput, { spaces: 2 });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw new Error(`Failed to save cell output: ${error}`);
    }
  }

  /**
   * Load cell output from disk
   */
  static async loadCellOutput(
    instanceId: string,
    notebookId: string,
    cellId: string,
  ): Promise<CellOutput | undefined> {
    try {
      const outputPath = this.getCellOutputPath(instanceId, notebookId, cellId);

      if (await fs.pathExists(outputPath)) {
        return await fs.readJson(outputPath);
      }

      return undefined;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      return undefined;
    }
  }

  /**
   * Delete cell output from disk
   */
  static async deleteCellOutput(
    instanceId: string,
    notebookId: string,
    cellId: string,
  ): Promise<void> {
    try {
      const outputPath = this.getCellOutputPath(instanceId, notebookId, cellId);

      if (await fs.pathExists(outputPath)) {
        await fs.remove(outputPath);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      // Don't throw - output deletion is not critical
    }
  }

  /**
   * Check if notebook exists
   */
  static async notebookExists(
    instanceId: string,
    notebookId: string,
  ): Promise<boolean> {
    const filePath = this.getNotebookFilePath(instanceId, notebookId);
    return fs.pathExists(filePath);
  }
}
