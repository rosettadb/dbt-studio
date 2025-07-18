/* eslint-disable no-await-in-loop */
import { DuckDBInstance } from '@duckdb/node-api';
import type { PreviewResult, PreviewOptions } from '../../types/frontend';
import {
  buildCloudSecretQuery,
  getCloudUrl,
  isPreviewSupported,
  handleProviderError,
  setupExtensions,
  buildPreviewQuery,
  extractColumns,
  cleanup,
  convertDuckDBValue,
} from '../helpers';

class CloudPreviewService {
  /**
   * Preview cloud data using DuckDB in-memory database
   */
  static async previewCloudData({
    provider,
    cloudConfig,
    objectPath,
    previewType = 'sample',
    limit = 100,
  }: PreviewOptions): Promise<PreviewResult> {
    let instance: any = null;
    let connection: any = null;
    try {
      // Create in-memory DuckDB instance
      instance = await DuckDBInstance.create(':memory:');
      connection = await instance.connect();

      // Install and load required extensions
      await setupExtensions(connection, provider, objectPath);

      // Configure cloud access secrets
      const secretQuery = await buildCloudSecretQuery(provider, cloudConfig);
      await connection.run(secretQuery);

      // Execute preview query
      const query = await buildPreviewQuery(
        connection,
        objectPath,
        previewType,
        limit,
      );

      const result = await connection.run(query);
      const rows = await result.getRows();

      // Get column information
      const columns = await extractColumns(
        result,
        connection,
        objectPath,
        rows,
      );

      // Convert DuckDB-specific types to regular JavaScript values
      const convertedRows = rows.map((row: any) => {
        if (Array.isArray(row)) {
          return row.map((cell: any) => convertDuckDBValue(cell));
        }
        if (typeof row === 'object' && row !== null) {
          const convertedRow: any = {};
          Object.keys(row).forEach((key) => {
            convertedRow[key] = convertDuckDBValue(row[key]);
          });
          return convertedRow;
        }
        return convertDuckDBValue(row);
      });

      return {
        success: true,
        data: convertedRows,
        columns,
        totalRows: previewType === 'stats' ? rows[0]?.total_rows : rows.length,
        objectPath,
        previewType,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error in previewCloudData:', error);

      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return handleProviderError(
        provider,
        errorMessage,
        objectPath,
        previewType,
      );
    } finally {
      await cleanup(connection, instance);
    }
  }

  /**
   * Get the appropriate cloud storage URL format for the provider
   */
  static getCloudUrl = getCloudUrl;

  /**
   * Check if file type is supported for preview
   */
  static isPreviewSupported = isPreviewSupported;
}

export default CloudPreviewService;
