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
 */
export async function buildPreviewQuery(
  connection: any,
  objectPath: string,
  previewType: 'sample' | 'schema' | 'stats',
  limit: number,
): Promise<string> {
  const { getReaderFunction } = await import('./fileType.helper');
  const readerFunction = await getReaderFunction(connection, objectPath);

  switch (previewType) {
    case 'sample':
      return `SELECT * FROM ${readerFunction} LIMIT ${limit}`;
    case 'schema':
      return `DESCRIBE SELECT * FROM ${readerFunction} LIMIT 0`;
    case 'stats':
      return `
        SELECT 
          count(*) as total_rows,
          count(DISTINCT *) as distinct_rows
        FROM ${readerFunction}
      `;
    default:
      throw new Error(`Unsupported preview type: ${previewType}`);
  }
}

/**
 * Extract column information from query result
 */
export async function extractColumns(
  result: any,
  connection: any,
  objectPath: string,
  rows: any[],
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

  // If we still don't have columns, try DESCRIBE query
  if (columns.length === 0 && rows.length > 0) {
    try {
      const { getReaderFunction } = await import('./fileType.helper');
      const readerFunction = await getReaderFunction(connection, objectPath);
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

  // Fallback: infer column names from the first row
  if (columns.length === 0 && rows.length > 0) {
    const firstRow = rows[0];
    if (Array.isArray(firstRow)) {
      columns = firstRow.map((_, index) => ({
        name: `Column ${index + 1}`,
        type: 'unknown',
      }));
    } else if (typeof firstRow === 'object' && firstRow !== null) {
      columns = Object.keys(firstRow).map((key) => ({
        name: key,
        type: 'unknown',
      }));
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
