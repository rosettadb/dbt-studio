/**
 * Data Export Service
 * Handles exporting notebook cell output data to various formats
 */

import { promises as fs } from 'fs';
import path from 'path';
import { app, dialog } from 'electron';
import Papa from 'papaparse';

export type ExportFormat = 'csv' | 'tsv' | 'json' | 'parquet';

export class DataExportService {
  /**
   * Export cell output data to a file
   */
  static async exportData(
    cellId: string,
    format: ExportFormat,
    data: any[],
  ): Promise<string> {
    try {
      // Show save dialog
      const { filePath } = await dialog.showSaveDialog({
        title: 'Export Data',
        defaultPath: path.join(
          app.getPath('downloads'),
          `export_${cellId}.${format}`,
        ),
        filters: this.getFileFilters(format),
      });

      if (!filePath) {
        throw new Error('Export cancelled');
      }

      // Export based on format
      switch (format) {
        case 'csv':
          await this.exportCSV(filePath, data);
          break;
        case 'tsv':
          await this.exportTSV(filePath, data);
          break;
        case 'json':
          await this.exportJSON(filePath, data);
          break;
        case 'parquet':
          await this.exportParquet(filePath, data);
          break;
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

      return filePath;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw new Error(`Failed to export data: ${(error as Error).message}`);
    }
  }

  /**
   * Get file filters for save dialog
   */
  private static getFileFilters(format: ExportFormat) {
    const filters = {
      csv: [{ name: 'CSV Files', extensions: ['csv'] }],
      tsv: [{ name: 'TSV Files', extensions: ['tsv'] }],
      json: [{ name: 'JSON Files', extensions: ['json'] }],
      parquet: [{ name: 'Parquet Files', extensions: ['parquet'] }],
    };
    return filters[format];
  }

  /**
   * Export to CSV format
   */
  private static async exportCSV(
    filePath: string,
    data: any[],
  ): Promise<void> {
    const csv = Papa.unparse(data, {
      header: true,
      delimiter: ',',
      newline: '\n',
    });
    await fs.writeFile(filePath, csv, 'utf-8');
  }

  /**
   * Export to TSV format
   */
  private static async exportTSV(
    filePath: string,
    data: any[],
  ): Promise<void> {
    const tsv = Papa.unparse(data, {
      header: true,
      delimiter: '\t',
      newline: '\n',
    });
    await fs.writeFile(filePath, tsv, 'utf-8');
  }

  /**
   * Export to JSON format
   */
  private static async exportJSON(
    filePath: string,
    data: any[],
  ): Promise<void> {
    const json = JSON.stringify(data, null, 2);
    await fs.writeFile(filePath, json, 'utf-8');
  }

  /**
   * Export to Parquet format
   * Note: This is a placeholder. For production, you would use a library like parquetjs
   * or write to DuckDB and export from there.
   */
  private static async exportParquet(
    filePath: string,
    data: any[],
  ): Promise<void> {
    // For now, we'll export as JSON with a note
    // In production, integrate with DuckDB to write Parquet files
    const note = {
      note: 'Parquet export requires DuckDB integration',
      data,
    };
    const json = JSON.stringify(note, null, 2);
    await fs.writeFile(filePath, json, 'utf-8');

    // TODO: Implement proper Parquet export using DuckDB
    // const connection = await ConnectionManager.getTemporaryConnection();
    // try {
    //   const tempTable = `temp_export_${Date.now()}`;
    //   await connection.query(`CREATE TEMP TABLE ${tempTable} AS SELECT * FROM ?`, [data]);
    //   await connection.query(`COPY ${tempTable} TO '${filePath}' (FORMAT PARQUET)`);
    // } finally {
    //   await connection.close();
    // }
  }
}
