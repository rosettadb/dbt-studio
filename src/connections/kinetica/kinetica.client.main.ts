/* eslint-disable prefer-promise-reject-errors, consistent-return */
import { buildKineticaUrl } from './kinetica.url.shared';
import { KineticaConnection, QueryResponseType } from '../../types/backend';

// Kinetica connection functions using GPUdb API
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GPUdb = require('../../main/lib/GPUdb');

export async function testKineticaConnection(
  config: KineticaConnection,
): Promise<boolean> {
  const url = buildKineticaUrl(config);

  try {
    // Create GPUdb instance
    const db = new GPUdb(url, {
      username: config.username,
      password: config.password,
      timeout: config.timeout || 30000,
    });

    // Test connection with a simple query using Promise wrapper
    const result: any = await new Promise((resolve, reject) => {
      db.execute_sql(
        'SELECT 1 as connection_test',
        0,
        1,
        '',
        null,
        {},
        (err: any, response: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(response);
          }
        },
      );
    });

    // Verify response contains expected data
    return (
      result &&
      result.data &&
      result.data.column_1 &&
      result.data.column_1.length > 0
    );
  } catch (error: any) {
    // eslint-disable-next-line no-console
    console.error('Kinetica connection test failed:', error.message);

    // Check for HTML response error (common when path is missing)
    if (
      error.message &&
      (error.message.includes('Unexpected token') ||
        error.message.includes('SyntaxError')) &&
      error.message.includes('<')
    ) {
      // eslint-disable-next-line no-console
      console.warn(
        'HINT: Received HTML response instead of JSON. If using Kinetica Cloud, ensure your Host field includes the full path (e.g. cluster.../gpudb-0).',
      );
    }

    return false;
  }
}

export const executeKineticaQuery = async (
  config: KineticaConnection,
  query: string,
  registerCancel?: (fn: () => void) => void,
): Promise<QueryResponseType> => {
  const url = buildKineticaUrl(config);

  let db: any;

  try {
    // Create GPUdb instance
    db = new GPUdb(url, {
      username: config.username,
      password: config.password,
      timeout: config.timeout || 30000,
    });

    // Register cancel callback if provided
    if (registerCancel) {
      registerCancel(() => {
        // GPUdb cleanup - the API doesn't expose a close method
        // but we can set db to null to help with garbage collection
        db = null;
      });
    }

    // Execute SQL query using Promise wrapper
    const result: any = await new Promise((resolve, reject) => {
      db.execute_sql(
        query,
        0,
        -9999, // Limit
        '',
        null,
        {},
        (err: any, response: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(response);
          }
        },
      );
    });

    // Transform GPUdb response to QueryResponseType
    // GPUdb returns data in format: { data: { column_1: [...], column_2: [...], column_headers: [...] }, ... }
    const { data } = result;

    if (!data || !data.column_headers) {
      return {
        success: false,
        error: 'Invalid response from Kinetica: Missing data or column headers',
      };
    }

    const columnHeaders = data.column_headers;
    const totalNumberOfRecords = result.total_number_of_records;

    // Map column headers to fields
    const fields = columnHeaders.map((header: string) => ({
      name: header,
      type: 0, // GPUdb doesn't provide type info in execute_sql response
    }));

    // Transform columnar data to row-based format
    // data returns: { column_1: [val1, val2], column_2: [val3, val4] }
    // We need: [{ col1: val1, col2: val3 }, { col1: val2, col2: val4 }]
    const numRows = data.column_1?.length || 0;
    const rows: any[] = [];

    for (let i = 0; i < numRows; i += 1) {
      const row: any = {};
      columnHeaders.forEach((header: string, colIndex: number) => {
        const columnKey = `column_${colIndex + 1}`;
        row[header] = data[columnKey]?.[i];
      });
      rows.push(row);
    }

    return {
      success: true,
      data: rows,
      fields,
      rowCount: totalNumberOfRecords || numRows,
    };
  } catch (err: any) {
    // Parse Kinetica error response
    const errorMessage = err.message || 'Unknown error';

    return {
      success: false,
      error: `Kinetica query failed: ${errorMessage}`,
    };
  }
};
