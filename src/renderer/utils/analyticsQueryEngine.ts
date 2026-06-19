/**
 * Analytics Query Engine
 *
 * Encapsulates SQL execution for analytics pages, handling both regular
 * DB connections and DuckLake connections transparently.
 */
import { executeQueryForConnection } from '../services/connectors.service';
import { DuckLakeService } from '../services/duckLake.service';

export type QueryExecutionResult = {
  name: string;
  status: 'success' | 'error';
  data: any[];
  fields: string[];
  rowCount: number;
  error?: string;
  duration?: number;
};

/**
 * Execute a single named SQL query for a given connection.
 * Handles DuckLake connections (prefixed with 'ducklake-') transparently.
 * Caps result rows at 500 to keep previews performant.
 *
 * NOTE: We do NOT assign DuckLake results to `QueryResponseType` because
 * DuckLakeQueryResult.fields[].type is `string | number` while
 * QueryResponseType.fields[].type is strictly `number`. Instead we handle
 * each branch independently and build our own return shape.
 */
export async function executeAnalyticsQuery(params: {
  queryName: string;
  sql: string;
  connectionId: string;
  signal?: AbortSignal;
}): Promise<QueryExecutionResult> {
  const { queryName, sql, connectionId } = params;
  const ROW_LIMIT = 500;

  try {
    if (connectionId.startsWith('ducklake-')) {
      const instanceId = connectionId.replace('ducklake-', '');
      const response = await DuckLakeService.executeQuery({
        instanceId,
        query: sql,
        limit: ROW_LIMIT,
        offset: 0,
      });

      if (!response.success) {
        return {
          name: queryName,
          status: 'error',
          data: [],
          fields: [],
          rowCount: 0,
          error: response.error ?? 'Query failed',
          duration: response.duration,
        };
      }

      const data = (response.data ?? []).slice(0, ROW_LIMIT);
      return {
        name: queryName,
        status: 'success',
        data,
        // DuckLake fields[].type is string | number — coerce to string for display
        fields: response.fields?.map((f) => String(f.name)) ?? [],
        rowCount: data.length,
        duration: response.duration,
      };
    }

    // Regular DB connection
    const response = await executeQueryForConnection({
      connectionId,
      query: sql,
    });

    if (!response.success) {
      return {
        name: queryName,
        status: 'error',
        data: [],
        fields: [],
        rowCount: 0,
        error: response.error ?? 'Query failed',
        duration: response.duration,
      };
    }

    const data = (response.data ?? []).slice(0, ROW_LIMIT);
    return {
      name: queryName,
      status: 'success',
      data,
      fields: response.fields?.map((f) => f.name) ?? [],
      rowCount: data.length,
      duration: response.duration,
    };
  } catch (err: any) {
    return {
      name: queryName,
      status: 'error',
      data: [],
      fields: [],
      rowCount: 0,
      error: err?.message ?? 'Unknown error',
    };
  }
}
