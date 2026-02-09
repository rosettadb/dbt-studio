/**
 * Schema Service
 * Extracts schema metadata from DuckLake catalog for autocomplete
 * Queries DuckLake metadata tables (ducklake_*) for rich schema information
 */

import DuckLakeService from '../duckLake.service';
import {
  SchemaInfo,
  SchemaMetadata,
  TableMetadata,
  ColumnMetadata,
} from '../../../types/notebook';

export class SchemaService {
  /**
   * Extract complete schema metadata from DuckLake catalog
   */
  static async extractSchema(instanceId: string): Promise<SchemaInfo> {
    try {
      // Verify instance exists
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const instance = await DuckLakeService.getInstance(instanceId);

      // Execute query using DuckLake service
      const executeQuery = async (sql: string): Promise<any[]> => {
        const result = await DuckLakeService.executeQuery({
          instanceId,
          sql,
        });
        return result.rows.map((row) => {
          const obj: Record<string, any> = {};
          result.columns.forEach((col, index) => {
            obj[col.name] = row[index];
          });
          return obj;
        });
      };

      // 1. Get latest snapshot
      const snapshotResult = await executeQuery(`
        SELECT snapshot_id, snapshot_time, schema_version
        FROM ducklake_snapshot
        WHERE snapshot_id = (SELECT max(snapshot_id) FROM ducklake_snapshot)
      `);

      if (snapshotResult.length === 0) {
        throw new Error('No snapshots found in DuckLake catalog');
      }

      const snapshot = snapshotResult[0];
      const snapshotId = snapshot.snapshot_id;

      // 2. Get all schemas
      const schemasResult = await executeQuery(`
        SELECT schema_id, schema_name, schema_uuid, path
        FROM ducklake_schema
        WHERE ${snapshotId} >= begin_snapshot
          AND (${snapshotId} < end_snapshot OR end_snapshot IS NULL)
        ORDER BY schema_name
      `);

      const schemas: SchemaMetadata[] = schemasResult.map((row) => ({
        schema_id: row.schema_id,
        schema_name: row.schema_name,
        schema_uuid: row.schema_uuid,
        path: row.path,
      }));

      // 3. Get all tables with stats
      const tablesResult = await executeQuery(`
        SELECT 
          t.table_id, t.table_name, t.table_uuid,
          t.schema_id, s.schema_name, t.path,
          ts.record_count, ts.file_size_bytes
        FROM ducklake_table AS t
        JOIN ducklake_schema AS s ON t.schema_id = s.schema_id
        LEFT JOIN ducklake_table_stats AS ts ON t.table_id = ts.table_id
        WHERE ${snapshotId} >= t.begin_snapshot
          AND (${snapshotId} < t.end_snapshot OR t.end_snapshot IS NULL)
          AND ${snapshotId} >= s.begin_snapshot
          AND (${snapshotId} < s.end_snapshot OR s.end_snapshot IS NULL)
        ORDER BY s.schema_name, t.table_name
      `);

      const tables: TableMetadata[] = tablesResult.map((row) => ({
        table_id: row.table_id,
        table_name: row.table_name,
        table_uuid: row.table_uuid,
        schema_id: row.schema_id,
        schema_name: row.schema_name,
        path: row.path,
        record_count: row.record_count,
        file_size_bytes: row.file_size_bytes,
      }));

      // 4. Get all columns with stats
      const columnsResult = await executeQuery(`
        SELECT 
          c.column_id, c.column_name, c.column_type,
          c.column_order, c.nulls_allowed, c.parent_column,
          parent.column_name AS parent_column_name,
          c.table_id, t.table_name, s.schema_name,
          cs.contains_null, cs.min_value, cs.max_value
        FROM ducklake_column AS c
        JOIN ducklake_table AS t ON c.table_id = t.table_id
        JOIN ducklake_schema AS s ON t.schema_id = s.schema_id
        LEFT JOIN ducklake_column AS parent ON c.parent_column = parent.column_id
        LEFT JOIN ducklake_table_column_stats AS cs 
          ON c.table_id = cs.table_id AND c.column_id = cs.column_id
        WHERE ${snapshotId} >= c.begin_snapshot
          AND (${snapshotId} < c.end_snapshot OR c.end_snapshot IS NULL)
          AND ${snapshotId} >= t.begin_snapshot
          AND (${snapshotId} < t.end_snapshot OR t.end_snapshot IS NULL)
          AND ${snapshotId} >= s.begin_snapshot
          AND (${snapshotId} < s.end_snapshot OR s.end_snapshot IS NULL)
        ORDER BY s.schema_name, t.table_name, c.column_order
      `);

      const columns: ColumnMetadata[] = columnsResult.map((row) => ({
        column_id: row.column_id,
        column_name: row.column_name,
        column_type: row.column_type,
        column_order: row.column_order,
        nulls_allowed: row.nulls_allowed,
        parent_column: row.parent_column,
        parent_column_name: row.parent_column_name,
        table_id: row.table_id,
        table_name: row.table_name,
        schema_name: row.schema_name,
        contains_null: row.contains_null,
        min_value: row.min_value,
        max_value: row.max_value,
      }));

      return {
        snapshot_id: snapshot.snapshot_id,
        snapshot_time: snapshot.snapshot_time,
        schema_version: snapshot.schema_version,
        schemas,
        tables,
        columns,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw new Error(`Failed to extract schema: ${error}`);
    }
  }

  /**
   * Get schema summary statistics
   */
  static async getSchemaSummary(instanceId: string): Promise<{
    schemaCount: number;
    tableCount: number;
    columnCount: number;
    totalRows: number;
    totalSize: number;
  }> {
    try {
      const schema = await this.extractSchema(instanceId);

      const totalRows = schema.tables.reduce(
        (sum, table) => sum + (table.record_count || 0),
        0,
      );

      const totalSize = schema.tables.reduce(
        (sum, table) => sum + (table.file_size_bytes || 0),
        0,
      );

      return {
        schemaCount: schema.schemas.length,
        tableCount: schema.tables.length,
        columnCount: schema.columns.length,
        totalRows,
        totalSize,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      throw error;
    }
  }
}
