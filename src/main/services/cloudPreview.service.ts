/* eslint-disable no-await-in-loop */
import DuckDBBootstrap from './duckdb.service';
import type { PreviewResult, PreviewOptions } from '../../types/frontend';
import {
  buildCloudSecretQuery,
  getCloudUrl,
  isPreviewSupported,
  handleProviderError,
  convertDuckDBValue,
} from '../helpers';
import {
  buildPreviewQuery,
  extractColumns,
  setupExtensions,
} from '../helpers/extensionSetup.helper';

class CloudPreviewService {
  /**
   * Preview cloud data using DuckDB persistent database
   */
  static async previewCloudData({
    provider,
    cloudConfig,
    objectPath,
    previewType = 'sample',
    limit = 100,
  }: PreviewOptions): Promise<PreviewResult> {
    let connection: any = null;

    try {
      // Get connection from persistent pool
      connection = await DuckDBBootstrap.getConnection('cloud-preview');

      // Install and load required extensions (idempotent)
      await setupExtensions(connection, provider, objectPath);

      // Configure cloud access secrets
      const secretQuery = await buildCloudSecretQuery(provider, cloudConfig);
      await connection.run(secretQuery);

      // Execute preview query
      // OPTIMIZATION: buildPreviewQuery now returns both query and readerFunction
      // so we can reuse readerFunction in extractColumns (avoiding redundant header detection)
      const { query, readerFunction } = await buildPreviewQuery(
        connection,
        objectPath,
        previewType,
        limit,
      );

      const result = await connection.run(query);

      const rows = await result.getRows();

      // Get column information
      // OPTIMIZATION: Pass readerFunction to avoid redundant header detection
      const columns = await extractColumns(
        result,
        connection,
        objectPath,
        rows,
        readerFunction, // Pass cached reader function to avoid redundant header detection
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
        totalRows:
          previewType === 'stats' ? rows[0]?.sampled_rows : rows.length,
        objectPath,
        previewType,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error in previewCloudData:', error, {
        objectPath,
        previewType,
      });

      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return handleProviderError(
        provider,
        errorMessage,
        objectPath,
        previewType,
      );
    } finally {
      if (connection) {
        await DuckDBBootstrap.releaseConnection(connection);
      }
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
