/**
 * Analytics Query Engine
 *
 * Encapsulates SQL execution for analytics pages, handling both regular
 * DB connections and DuckLake connections transparently.
 * Supports {{query_name}} dependency resolution for inter-query references.
 */
import { executeQueryForConnection } from '../services/connectors.service';
import { DuckLakeService } from '../services/duckLake.service';
import {
  buildQueryDependencyGraph,
  validateQueryReferences,
} from '../components/analytics/runtime/queryDependencyResolver';

export type QueryExecutionResult = {
  name: string;
  status: 'success' | 'error';
  data: any[];
  fields: string[];
  rowCount: number;
  error?: string;
  duration?: number;
};

export type DependencyError = {
  type: 'missing' | 'circular' | 'self-reference';
  message: string;
  blockName?: string;
};

/**
 * Resolve dependencies for all SQL blocks in a markdown page and
 * return the correct execution order with resolved SQL.
 */
export function resolveQueryDependencies(markdownContent: string): {
  resolved: Array<{ name: string; sql: string }>;
  errors: DependencyError[];
} {
  const errors: DependencyError[] = [];

  // First check for missing references
  const refErrors = validateQueryReferences(markdownContent);
  refErrors.forEach((err) => {
    if (err.error.includes('Self-referencing')) {
      errors.push({
        type: 'self-reference',
        message: err.error,
        blockName: err.blockName,
      });
    } else {
      errors.push({
        type: 'missing',
        message: err.error,
        blockName: err.blockName,
      });
    }
  });

  if (errors.length > 0) {
    return { resolved: [], errors };
  }

  try {
    const { graph, sqlBlocks } = buildQueryDependencyGraph(markdownContent);

    // Sort blocks by topological order
    const blockMap = new Map(sqlBlocks.map((b) => [b.name, b]));
    const resolved = graph.topoOrder
      .map((name) => blockMap.get(name))
      .filter(Boolean) as Array<{ name: string; sql: string }>;

    return { resolved, errors };
  } catch (err: any) {
    const msg = err?.message ?? 'Unknown dependency error';
    if (msg.includes('Circular')) {
      errors.push({ type: 'circular', message: msg });
    } else if (msg.includes('Self-referencing')) {
      errors.push({ type: 'self-reference', message: msg });
    } else {
      errors.push({ type: 'missing', message: msg });
    }
    return { resolved: [], errors };
  }
}

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
      query: `SELECT * FROM (\n${sql}\n) AS _limit_wrapper LIMIT ${ROW_LIMIT}`,
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
