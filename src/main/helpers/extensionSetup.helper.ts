/**
 * Extension Setup Helper
 * Contains logic for setting up DuckDB extensions based on cloud provider and file type
 */

import type { CloudProvider } from '../../types/frontend';
import { getExtensionMap } from './fileType.helper';

/**
 * Setup required DuckDB extensions
 */
export async function setupExtensions(
  connection: any,
  provider: CloudProvider,
  objectPath: string,
): Promise<void> {
  // Install and load httpfs extension (required for all cloud providers)
  try {
    await connection.run('INSTALL httpfs');
    await connection.run('LOAD httpfs');
  } catch (e) {
    // Ignore if already installed/loaded
  }

  // OPTIMIZATION: Enable httpfs caching to reduce S3/cloud request latency
  // This is critical for performance on large files with range requests
  try {
    await connection.run('SET enable_http_metadata_cache=true');
    await connection.run('SET enable_object_cache=true');
  } catch (e) {
    // Ignore if settings not invalid or not supported in this version
    // eslint-disable-next-line no-console
    console.warn('Failed to set httpfs cache settings:', e);
  }

  // Install cloud-specific extensions
  if (provider === 'azure') {
    try {
      await connection.run('INSTALL azure');
      await connection.run('LOAD azure');
    } catch (e) {
      // Ignore
    }
  }

  // Install file-type-specific extensions
  const fileExtension = objectPath.split('.').pop()?.toLowerCase();
  const extensionMap = getExtensionMap();

  if (fileExtension && extensionMap[fileExtension]) {
    const extensionName = extensionMap[fileExtension];

    // Skip installing built-in extensions
    if (!['parquet', 'csv'].includes(extensionName)) {
      try {
        await connection.run(`INSTALL ${extensionName}`);
        await connection.run(`LOAD ${extensionName}`);
      } catch (extensionError) {
        // eslint-disable-next-line no-console
        console.warn(
          `Failed to load ${extensionName} extension:`,
          extensionError,
        );
        // Continue execution - might still work with generic approach
      }
    }
  }
}

/**
 * Build the appropriate preview query
 * OPTIMIZATION: Returns both query and readerFunction to enable reuse in extractColumns
 */
export async function buildPreviewQuery(
  connection: any,
  objectPath: string,
  previewType: 'sample' | 'schema' | 'stats',
  limit: number,
): Promise<{ query: string; readerFunction: string }> {
  let query = '';

  const { getReaderFunction } = await import('./fileType.helper');
  const readerFunction = await getReaderFunction(connection, objectPath);

  switch (previewType) {
    case 'sample':
      query = `SELECT * FROM ${readerFunction} LIMIT ${limit}`;
      break;
    case 'schema':
      query = `DESCRIBE SELECT * FROM ${readerFunction} LIMIT 0`;
      break;
    case 'stats':
      // OPTIMIZATION: For stats, use sample-based estimation for large files
      // This avoids scanning the entire file for count(*)
      query = `
        WITH sample_data AS (
          SELECT * FROM ${readerFunction} LIMIT 10000
        )
        SELECT 
          (SELECT count(*) FROM sample_data) as sampled_rows,
          (SELECT count(DISTINCT *) FROM sample_data) as distinct_in_sample,
          'sample_estimate' as count_type
      `;
      break;
    default:
      throw new Error(`Unsupported preview type: ${previewType}`);
  }

  return { query, readerFunction };
}

/**
 * Extract column information from query result
 * OPTIMIZATION: Accepts optional readerFunction to avoid redundant header detection
 *
 * @param result - DuckDB query result
 * @param connection - DuckDB connection
 * @param objectPath - Path to the file
 * @param rows - Query result rows
 * @param cachedReaderFunction - Optional pre-built reader function to avoid redundant header detection
 */
export async function extractColumns(
  result: any,
  connection: any,
  objectPath: string,
  rows: any[],
  cachedReaderFunction?: string,
): Promise<Array<{ name: string; type: string }>> {
  let columns: Array<{ name: string; type: string }> = [];

  // First try to get column info from the result schema
  if (result.schema?.fields) {
    columns = result.schema.fields.map((field: any) => ({
      name: field.name,
      type: field.type?.toString() || 'unknown',
    }));
  } else if (result.schema && Array.isArray(result.schema)) {
    columns = result.schema.map((field: any) => ({
      name: field.name || field.column_name || 'unknown',
      type: field.type || field.column_type || 'unknown',
    }));
  }

  // OPTIMIZATION: Try to infer columns from rows, BUT only if we can get actual names
  if (columns.length === 0 && rows.length > 0) {
    const firstRow = rows[0];

    // If rows are objects, we have the keys! Fast and correct.
    if (
      typeof firstRow === 'object' &&
      firstRow !== null &&
      !Array.isArray(firstRow)
    ) {
      columns = Object.keys(firstRow).map((key) => {
        const val = firstRow[key];
        let type = 'VARCHAR'; // Default
        if (typeof val === 'number')
          type = Number.isInteger(val) ? 'BIGINT' : 'DOUBLE';
        else if (typeof val === 'boolean') type = 'BOOLEAN';
        else if (val instanceof Date) type = 'TIMESTAMP';

        return {
          name: key,
          type,
        };
      });
    }
    // If arrays, we lack names. We MUST try DESCRIBE or we get "Column 1".
    // We defer array handling to the fallback below.
  }

  // If we still don't have columns, try DESCRIBE query
  if (columns.length === 0) {
    try {
      // OPTIMIZATION: Use cached reader function if provided to avoid redundant header detection
      let readerFunction: string;
      if (cachedReaderFunction) {
        readerFunction = cachedReaderFunction;
      } else {
        const { getReaderFunction } = await import('./fileType.helper');
        readerFunction = await getReaderFunction(connection, objectPath);
      }

      const describeQuery = `DESCRIBE SELECT * FROM ${readerFunction} LIMIT 0`;
      const describeResult = await connection.run(describeQuery);
      const describeRows = await describeResult.getRows();

      if (describeRows.length > 0) {
        columns = describeRows.map((descRow: any) => {
          if (Array.isArray(descRow)) {
            return {
              name: descRow[0]?.toString() || 'unknown',
              type: descRow[1]?.toString() || 'unknown',
            };
          }
          return {
            name: descRow.column_name || descRow.name || 'unknown',
            type: descRow.column_type || descRow.type || 'unknown',
          };
        });
      }
    } catch (columnError) {
      // eslint-disable-next-line no-console
      console.warn('Failed to get column names with DESCRIBE:', columnError);
    }
  }

  // Fallback: If DESCRIBE failed but we have rows (arrays), generate "Column N"
  if (columns.length === 0 && rows.length > 0) {
    const firstRow = rows[0];
    if (Array.isArray(firstRow)) {
      columns = firstRow.map((value, index) => {
        let type = 'VARCHAR'; // Default
        if (typeof value === 'number')
          type = Number.isInteger(value) ? 'BIGINT' : 'DOUBLE';
        else if (typeof value === 'boolean') type = 'BOOLEAN';
        else if (value instanceof Date) type = 'TIMESTAMP';

        return {
          name: `Column ${index + 1}`,
          type,
        };
      });
    }
  }

  return columns;
}

/**
 * Cleanup database connections
 */
export async function cleanup(connection: any, instance: any): Promise<void> {
  try {
    if (connection) {
      if (typeof connection.close === 'function') {
        await connection.close();
      } else if (typeof connection.closeSync === 'function') {
        connection.closeSync();
      }
    }
    if (instance) {
      if (typeof instance.close === 'function') {
        await instance.close();
      } else if (typeof instance.closeSync === 'function') {
        instance.closeSync();
      }
    }
  } catch (error) {
    // Ignore cleanup errors
  }
}
