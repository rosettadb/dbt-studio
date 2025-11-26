/* eslint-disable no-await-in-loop */
import { DuckDBInstance } from '@duckdb/node-api';
import type { PreviewResult, PreviewOptions } from '../../types/frontend';
import {
  buildCloudSecretQuery,
  getCloudUrl,
  isPreviewSupported,
  handleProviderError,
  cleanup,
  convertDuckDBValue,
} from '../helpers';
import {
  buildPreviewQuery,
  extractColumns,
  setupExtensions,
} from '../helpers/extensionSetup.helper';
import { DuckDBBootstrap } from './duckdb.bootstrap';

// Environment flag to force in-memory mode (for troubleshooting)
const FORCE_IN_MEMORY = process.env.DUCKDB_FORCE_IN_MEMORY === 'true';

class CloudPreviewService {
  /**
   * Preview cloud data using persistent DuckDB database
   * Falls back to in-memory database if persistent DB is unavailable
   */
  static async previewCloudData({
    provider,
    cloudConfig,
    objectPath,
    previewType = 'sample',
    limit = 100,
  }: PreviewOptions): Promise<PreviewResult> {
    let connection: any = null;
    let instance: any = null;
    let usingPersistentDB = false;

    try {
      // Try to use persistent database first
      if (!FORCE_IN_MEMORY) {
        try {
          const dbMeta = DuckDBBootstrap.getMetadata();
          if (dbMeta.initialized) {
            connection = await DuckDBBootstrap.getConnection('CloudPreview');
            usingPersistentDB = true;
          } else {
            // eslint-disable-next-line no-console
            console.warn(
              '[CloudPreview] Persistent DB not initialized, falling back to in-memory',
            );
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn(
            '[CloudPreview] Failed to get persistent connection, falling back to in-memory:',
            error,
          );
        }
      } else {
        // eslint-disable-next-line no-console
        console.warn(
          '[CloudPreview] DUCKDB_FORCE_IN_MEMORY is set, using in-memory database',
        );
      }

      // Fallback to in-memory if persistent DB unavailable
      if (!connection) {
        instance = await DuckDBInstance.create(':memory:');
        connection = await instance.connect();
        usingPersistentDB = false;
      }

      // Install and load required extensions (only needed for in-memory)
      if (!usingPersistentDB) {
        await setupExtensions(connection, provider, objectPath);
      }

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
      // Cleanup based on which mode was used
      if (usingPersistentDB && connection) {
        // Release connection back to pool
        DuckDBBootstrap.releaseConnection(connection, 'CloudPreview');
      } else if (instance) {
        // Cleanup in-memory instance
        await cleanup(connection, instance);
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
