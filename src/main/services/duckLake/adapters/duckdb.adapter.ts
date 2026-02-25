/**
 * DuckDB Catalog Adapter
 * Implements DuckLake integration with DuckDB file-based catalog
 */

import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';
import {
  CatalogAdapter,
  ValidationResult,
  HealthStatus,
  ConnectionInfo,
} from './base.adapter';
import {
  DuckLakeCatalogConfig,
  DuckLakeInstance,
  DuckLakeTableInfo,
  DuckLakeSnapshotInfo,
  DuckLakeSnapshotDetail,
  DuckLakeQueryResult,
  DuckLakeQueryRequest,
  DuckLakeStorageConfig,
  DuckLakeSnapshotParams,
  DuckLakePaginatedResult,
} from '../../../../types/duckLake';
import { DuckLakeError } from '../../../../types/duckLakeErrors';
import { normalizeNumericValue } from '../../../../renderer/utils/fileUtils';

export class DuckDBCatalogAdapter extends CatalogAdapter {
  async connect(
    config: DuckLakeCatalogConfig,
    instance: DuckLakeInstance,
    storageConfig?: DuckLakeStorageConfig,
  ): Promise<ConnectionInfo> {
    try {
      if (config.type !== 'duckdb') {
        throw DuckLakeError.unsupportedCatalog(config.type);
      }

      if (!config.duckdb?.metadataPath) {
        throw DuckLakeError.validation('DuckDB metadata path is required');
      }

      // Initialize DuckDB instance
      const duckdbInstance = await this.initializeDuckDB(
        instance.runtimeOptions,
      );
      const connection = await duckdbInstance.connect();

      // Load DuckLake extension
      await this.loadDuckLakeExtension(connection);

      // Create secrets for cloud storage
      await this.createSecrets(connection, storageConfig);

      // Ensure metadata directory exists
      const metadataDir = path.dirname(config.duckdb.metadataPath);
      if (!fs.existsSync(metadataDir)) {
        fs.mkdirSync(metadataDir, { recursive: true });
      }

      // Attach DuckLake catalog with DuckDB backend
      const attachString = `ducklake:${config.duckdb.metadataPath}`;
      await this.attachDuckLakeCatalog(
        connection,
        attachString,
        instance.name,
        instance.dataPath,
      );

      this.connectionInfo = {
        instance: duckdbInstance,
        connection,
        catalogType: 'duckdb',
        instanceName: instance.name,
        connectedAt: new Date(),
      };

      return this.connectionInfo;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('DuckDB catalog connection failed:', error);
      throw DuckLakeError.catalogConnection(instance.id, error as Error);
    }
  }

  async restoreSnapshot(tableName: string, snapshotId: number): Promise<void> {
    try {
      if (!this.connectionInfo) {
        throw new Error('No active connection');
      }

      const escapedName = tableName.replace(/"/g, '""');

      // Correct DuckLake restore pattern:
      // 1. Delete all current rows (keeps table lineage/schema)
      // 2. Insert rows from the specific snapshot version
      await this.connectionInfo.connection.run('BEGIN TRANSACTION');

      try {
        // Truncate current data (logically retains history in DuckLake)
        await this.connectionInfo.connection.run(
          `DELETE FROM "${escapedName}"`,
        );

        // Restore data from snapshot
        await this.connectionInfo.connection.run(
          `INSERT INTO "${escapedName}" SELECT * FROM "${escapedName}" AT (VERSION => ${snapshotId})`,
        );

        await this.connectionInfo.connection.run('COMMIT');
      } catch (innerError) {
        await this.connectionInfo.connection.run('ROLLBACK');
        throw innerError;
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `Failed to restore DuckDB table ${tableName} to snapshot ${snapshotId}:`,
        error,
      );
      throw error;
    }
  }

  async addColumn(
    tableName: string,
    columnName: string,
    columnType: string,
    defaultValue?: string,
  ): Promise<void> {
    try {
      if (!this.connectionInfo) {
        throw new Error('No active connection');
      }

      const escapedTableName = tableName.replace(/"/g, '""');
      const escapedColumnName = columnName.replace(/"/g, '""');

      // Validate column type to prevent SQL injection
      const validatedType = this.validateColumnType(columnType);

      let defaultClause = '';
      if (defaultValue && defaultValue.trim() !== '') {
        // Sanitize default value to prevent SQL injection
        const sanitizedDefault = this.sanitizeDefaultValue(defaultValue);
        defaultClause = ` DEFAULT ${sanitizedDefault}`;
      }

      await this.connectionInfo.connection.run(
        `ALTER TABLE "${escapedTableName}" ADD COLUMN "${escapedColumnName}" ${validatedType}${defaultClause}`,
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `Failed to add column ${columnName} to DuckDB table ${tableName}:`,
        error,
      );
      throw error;
    }
  }

  async dropColumn(tableName: string, columnName: string): Promise<void> {
    try {
      if (!this.connectionInfo) {
        throw new Error('No active connection');
      }

      const escapedTableName = tableName.replace(/"/g, '""');
      const escapedColumnName = columnName.replace(/"/g, '""');

      await this.connectionInfo.connection.run(
        `ALTER TABLE "${escapedTableName}" DROP COLUMN "${escapedColumnName}"`,
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `Failed to drop column ${columnName} from DuckDB table ${tableName}:`,
        error,
      );
      throw error;
    }
  }

  async renameColumn(
    tableName: string,
    oldColumnName: string,
    newColumnName: string,
  ): Promise<void> {
    try {
      if (!this.connectionInfo) {
        throw new Error('No active connection');
      }

      const escapedTableName = tableName.replace(/"/g, '""');
      const escapedOldColumnName = oldColumnName.replace(/"/g, '""');
      const escapedNewColumnName = newColumnName.replace(/"/g, '""');

      await this.connectionInfo.connection.run(
        `ALTER TABLE "${escapedTableName}" RENAME COLUMN "${escapedOldColumnName}" TO "${escapedNewColumnName}"`,
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `Failed to rename column ${oldColumnName} to ${newColumnName} on DuckDB table ${tableName}:`,
        error,
      );
      throw error;
    }
  }

  async alterColumnType(
    tableName: string,
    columnName: string,
    newType: string,
  ): Promise<void> {
    try {
      if (!this.connectionInfo) {
        throw new Error('No active connection');
      }

      const escapedTableName = tableName.replace(/"/g, '""');
      const escapedColumnName = columnName.replace(/"/g, '""');

      // Validate column type to prevent SQL injection
      const validatedType = this.validateColumnType(newType);

      await this.connectionInfo.connection.run(
        `ALTER TABLE "${escapedTableName}" ALTER COLUMN "${escapedColumnName}" TYPE ${validatedType}`,
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `Failed to alter column ${columnName} type to ${newType} on DuckDB table ${tableName}:`,
        error,
      );
      throw error;
    }
  }

  async setPartitionedBy(
    tableName: string,
    columnNames: string[],
  ): Promise<void> {
    try {
      if (!this.connectionInfo) {
        throw new Error('No active connection');
      }

      const escapedTableName = tableName.replace(/"/g, '""');
      const escapedColumns = columnNames.map(
        (c) => `"${c.replace(/"/g, '""')}"`,
      );

      await this.connectionInfo.connection.run(
        `ALTER TABLE "${escapedTableName}" SET PARTITIONED BY (${escapedColumns.join(
          ', ',
        )})`,
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `Failed to set partition columns (${columnNames.join(', ')}) on DuckDB table ${tableName}:`,
        error,
      );
      throw error;
    }
  }

  async renameTable(oldName: string, newName: string): Promise<void> {
    try {
      if (!this.connectionInfo) {
        throw new Error('No active connection');
      }

      const escapedOldName = oldName.replace(/"/g, '""');
      const escapedNewName = newName.replace(/"/g, '""');

      await this.connectionInfo.connection.run(
        `ALTER TABLE "${escapedOldName}" RENAME TO "${escapedNewName}"`,
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `Failed to rename DuckDB table ${oldName} to ${newName}:`,
        error,
      );
      throw error;
    }
  }

  async updateRows(
    _tableName: string,
    updateQuery: string,
  ): Promise<{ rowsAffected: number }> {
    try {
      if (!this.connectionInfo) {
        throw new Error('No active connection');
      }

      const result = await this.connectionInfo.connection.run(updateQuery);

      // Try to get rows to determine affected count (requires RETURNING clause in query)
      let rowsAffected = 0;
      try {
        const rows = await result.getRows();
        if (rows && rows.length > 0) {
          rowsAffected = rows.length;
        }
      } catch (e) {
        // Ignore errors if result doesn't support getRows
      }

      return { rowsAffected };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to update rows:', error);
      throw error;
    }
  }

  async deleteRows(
    _tableName: string,
    deleteQuery: string,
  ): Promise<{ rowsAffected: number }> {
    try {
      if (!this.connectionInfo) {
        throw new Error('No active connection');
      }

      const result = await this.connectionInfo.connection.run(deleteQuery);

      let rowsAffected = 0;
      try {
        const rows = await result.getRows();
        if (rows && rows.length > 0) {
          rowsAffected = rows.length;
        }
      } catch (e) {
        // Ignore
      }

      return { rowsAffected };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to delete rows:', error);
      throw error;
    }
  }

  async upsertRows(
    _tableName: string,
    upsertQuery: string,
  ): Promise<{ rowsAffected: number }> {
    try {
      if (!this.connectionInfo) {
        throw new Error('No active connection');
      }

      const result = await this.connectionInfo.connection.run(upsertQuery);

      let rowsAffected = 0;
      try {
        const rows = await result.getRows();
        if (rows && rows.length > 0) {
          rowsAffected = rows.length;
        }
      } catch (e) {
        // Ignore
      }

      return { rowsAffected };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to upsert rows:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.cleanup();
  }

  private async getAvailableSnapshotColumns(metadataDatabase: string): Promise<{
    hasAuthor: boolean;
    hasCommitMessage: boolean;
    hasCommitExtraInfo: boolean;
  }> {
    try {
      // Check available columns in ducklake_snapshot_changes
      // We use safe identifier quoting for the database name
      if (!this.connectionInfo) {
        return {
          hasAuthor: false,
          hasCommitMessage: false,
          hasCommitExtraInfo: false,
        };
      }

      const safeMetadataDb = `"${metadataDatabase.replace(/"/g, '""')}"`;
      const tableInfoQuery = `PRAGMA table_info(${safeMetadataDb}.main.ducklake_snapshot_changes)`;
      const result = await this.connectionInfo.connection.run(tableInfoQuery);
      const rows = await result.getRows();

      const columnNames = rows
        .map((row: any) => (Array.isArray(row) ? row[1] : row.name))
        .map((name: string) => name.toLowerCase());

      return {
        hasAuthor: columnNames.includes('author'),
        hasCommitMessage: columnNames.includes('commit_message'),
        hasCommitExtraInfo: columnNames.includes('commit_extra_info'),
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(
        'Failed to check table info for ducklake_snapshot_changes',
        error,
      );
      return {
        hasAuthor: false,
        hasCommitMessage: false,
        hasCommitExtraInfo: false,
      };
    }
  }

  // eslint-disable-next-line class-methods-use-this
  async validateConfig(
    config: DuckLakeCatalogConfig,
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      if (config.type !== 'duckdb') {
        errors.push('Invalid catalog type for DuckDB adapter');
        return { valid: false, errors, warnings };
      }

      if (!config.duckdb?.metadataPath) {
        errors.push('DuckDB metadata path is required');
        return { valid: false, errors, warnings };
      }

      // Validate metadata path
      const { metadataPath } = config.duckdb;
      const metadataDir = path.dirname(metadataPath);

      // Check if directory exists or can be created
      if (!fs.existsSync(metadataDir)) {
        try {
          fs.mkdirSync(metadataDir, { recursive: true });
          warnings.push(`Created metadata directory: ${metadataDir}`);
        } catch (error) {
          errors.push(`Cannot create metadata directory: ${metadataDir}`);
        }
      }

      // Check write permissions
      try {
        fs.accessSync(metadataDir, fs.constants.W_OK);
      } catch (error) {
        errors.push(
          `No write permission for metadata directory: ${metadataDir}`,
        );
      }

      // Validate file extension
      if (!metadataPath.endsWith('.duckdb')) {
        warnings.push('DuckDB metadata file should have .duckdb extension');
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('DuckDB config validation error:', error);
      errors.push(`Validation error: ${(error as Error).message}`);
      return { valid: false, errors, warnings };
    }
  }

  async testConnection(config: DuckLakeCatalogConfig): Promise<HealthStatus> {
    const startTime = Date.now();
    let testInstance = null;
    let testConnection = null;

    try {
      // Validate config first
      const validation = await this.validateConfig(config);
      if (!validation.valid) {
        return {
          connected: false,
          lastChecked: new Date(),
          error: validation.errors.join('; '),
        };
      }

      // Test DuckDB connection
      testInstance = await this.initializeDuckDB();
      testConnection = await testInstance.connect();

      // Test DuckLake extension loading
      await this.loadDuckLakeExtension(testConnection);

      const responseTime = Date.now() - startTime;

      return {
        connected: true,
        lastChecked: new Date(),
        responseTime,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('DuckDB connection test failed:', error);
      return {
        connected: false,
        lastChecked: new Date(),
        responseTime: Date.now() - startTime,
        error: (error as Error).message,
      };
    } finally {
      // Explicitly clean up test resources
      if (testConnection) {
        try {
          testConnection.closeSync();
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Error closing test connection:', error);
        }
      }
      if (testInstance && typeof testInstance.close === 'function') {
        try {
          await testInstance.close();
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Error closing test instance:', error);
        }
      }
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    const startTime = Date.now();

    try {
      if (!this.connectionInfo) {
        return {
          connected: false,
          lastChecked: new Date(),
          error: 'No active connection',
        };
      }

      // Test connection with simple query
      const result =
        await this.connectionInfo.connection.run('SELECT 1 as test');
      await result.getRows();

      return {
        connected: true,
        lastChecked: new Date(),
        responseTime: Date.now() - startTime,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('DuckDB health check failed:', error);
      return {
        connected: false,
        lastChecked: new Date(),
        responseTime: Date.now() - startTime,
        error: (error as Error).message,
      };
    }
  }

  async listTables(): Promise<DuckLakeTableInfo[]> {
    try {
      // eslint-disable-next-line no-console
      console.log('[DuckDB Adapter] listTables() called');

      if (!this.connectionInfo) {
        throw new Error('No active connection');
      }

      // First, find the DuckLake metadata database (attached database)
      const databasesQuery = `
        SELECT database_name
        FROM duckdb_databases()
        WHERE database_name LIKE '__ducklake_metadata_%'
        LIMIT 1
      `;

      // eslint-disable-next-line no-console
      console.log('[DuckDB Adapter] Searching for metadata database...');
      const databasesResult =
        await this.connectionInfo.connection.run(databasesQuery);
      const databaseRows = await databasesResult.getRows();

      if (databaseRows.length === 0) {
        // eslint-disable-next-line no-console
        console.log(
          '[DuckDB Adapter] No metadata database found, listing all databases:',
        );
        const allDatabasesResult = await this.connectionInfo.connection.run(
          'SELECT database_name FROM duckdb_databases()',
        );
        const allDatabases = await allDatabasesResult.getRows();
        // eslint-disable-next-line no-console
        console.log('[DuckDB Adapter] All databases:', allDatabases);
        return [];
      }

      const metadataDatabase = Array.isArray(databaseRows[0])
        ? databaseRows[0][0]
        : (databaseRows[0] as any).database_name;

      // eslint-disable-next-line no-console
      console.log(
        '[DuckDB Adapter] Found metadata database:',
        metadataDatabase,
      );

      // Quote the database name to handle special characters (hyphens, etc.)
      const quotedMetadataDatabase = `"${metadataDatabase}"`;

      const query = `
        WITH current_snapshot AS (
          SELECT COALESCE(max(snapshot_id), 0) as snapshot_id
          FROM ${quotedMetadataDatabase}.main.ducklake_snapshot
        )
        SELECT
          t.table_id,
          t.table_name,
          s.schema_name,
          t.table_uuid,
          cs.snapshot_id as current_snapshot,
          ts.record_count,
          ts.file_size_bytes,
          snap.snapshot_time
        FROM ${quotedMetadataDatabase}.main.ducklake_table t
        JOIN ${quotedMetadataDatabase}.main.ducklake_schema s ON t.schema_id = s.schema_id
        LEFT JOIN ${quotedMetadataDatabase}.main.ducklake_table_stats ts
          ON ts.table_id = t.table_id
        LEFT JOIN ${quotedMetadataDatabase}.main.ducklake_snapshot snap ON snap.snapshot_id = t.begin_snapshot
        CROSS JOIN current_snapshot cs
        WHERE cs.snapshot_id >= t.begin_snapshot
          AND (cs.snapshot_id < t.end_snapshot OR t.end_snapshot IS NULL)
          AND cs.snapshot_id >= s.begin_snapshot
          AND (cs.snapshot_id < s.end_snapshot OR s.end_snapshot IS NULL)
        ORDER BY s.schema_name, t.table_name
      `;

      const result = await this.connectionInfo.connection.run(query);
      const rows = await result.getRows();

      const tables: DuckLakeTableInfo[] = rows.map((row: any) => {
        if (Array.isArray(row)) {
          const [
            ,
            tableName,
            schemaName,
            ,
            ,
            recordCount,
            fileSizeBytes,
            snapshotTime,
          ] = row;
          return {
            name: tableName,
            schema: schemaName || 'main',
            instanceId: '',
            columns: [],
            snapshots: [],
            createdAt: snapshotTime ? new Date(snapshotTime) : new Date(),
            updatedAt: snapshotTime ? new Date(snapshotTime) : new Date(),
            rowCount: normalizeNumericValue(recordCount),
            sizeBytes: normalizeNumericValue(fileSizeBytes),
          };
        }

        return {
          name: row.table_name,
          schema: row.schema_name || 'main',
          instanceId: '',
          columns: [],
          snapshots: [],
          createdAt: row.snapshot_time
            ? new Date(row.snapshot_time)
            : new Date(),
          updatedAt: row.snapshot_time
            ? new Date(row.snapshot_time)
            : new Date(),
          rowCount: normalizeNumericValue(row.record_count),
          sizeBytes: normalizeNumericValue(row.file_size_bytes),
        };
      });

      return tables;
    } catch (error: any) {
      const errorMessage = error.message || '';

      // eslint-disable-next-line no-console
      console.error('[DuckDB Adapter] listTables error:', error);

      if (
        errorMessage.includes('ducklake_snapshot does not exist') ||
        errorMessage.includes('ducklake_table does not exist') ||
        errorMessage.includes('Catalog Error')
      ) {
        return [];
      }

      throw error;
    }
  }

  async getTable(tableName: string): Promise<DuckLakeTableInfo> {
    try {
      if (!this.connectionInfo) {
        throw new Error('No active connection');
      }

      const databasesQuery = `
        SELECT database_name
        FROM duckdb_databases()
        WHERE database_name LIKE '__ducklake_metadata_%'
        LIMIT 1
      `;

      const databasesResult =
        await this.connectionInfo.connection.run(databasesQuery);
      const databaseRows = await databasesResult.getRows();

      if (databaseRows.length === 0) {
        throw new Error('DuckLake metadata database not found');
      }

      const metadataDatabase = Array.isArray(databaseRows[0])
        ? databaseRows[0][0]
        : (databaseRows[0] as any).database_name;

      // Quote the database name to handle special characters (hyphens, etc.)
      const quotedMetadataDatabase = `"${metadataDatabase}"`;

      // Escape single quotes in table name for SQL safety
      const escapedTableName = tableName.replace(/'/g, "''");

      const tableQuery = `
        SELECT
          t.table_name,
          s.schema_name,
          t.created_at,
          t.updated_at
        FROM ${quotedMetadataDatabase}.main.ducklake_table t
        JOIN ${quotedMetadataDatabase}.main.ducklake_schema s ON t.schema_id = s.schema_id
        WHERE t.table_name = '${escapedTableName}'
      `;

      const tableResult = await this.connectionInfo.connection.run(tableQuery);
      const tableRows = await tableResult.getRows();

      if (tableRows.length === 0) {
        throw new Error(`Table not found: ${tableName}`);
      }

      const tableRow = Array.isArray(tableRows[0])
        ? {
            table_name: tableRows[0][0],
            schema_name: tableRows[0][1],
            created_at: tableRows[0][2],
            updated_at: tableRows[0][3],
          }
        : tableRows[0];

      const columnsQuery = `
        SELECT
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.comment
        FROM ${quotedMetadataDatabase}.main.ducklake_column c
        JOIN ${quotedMetadataDatabase}.main.ducklake_table t ON c.table_id = t.table_id
        WHERE t.table_name = '${escapedTableName}'
        ORDER BY c.ordinal_position
      `;

      const columnsResult =
        await this.connectionInfo.connection.run(columnsQuery);
      const columnRows = await columnsResult.getRows();

      const columns = columnRows.map((col: any) => {
        if (Array.isArray(col)) {
          return {
            name: col[0],
            type: col[1],
            nullable: col[2],
            comment: col[3],
          };
        }

        return {
          name: col.column_name,
          type: col.data_type,
          nullable: col.is_nullable,
          comment: col.comment,
        };
      });

      return {
        name: tableRow.table_name,
        schema: tableRow.schema_name || 'main',
        instanceId: '',
        columns,
        snapshots: [],
        createdAt: new Date(tableRow.created_at),
        updatedAt: new Date(tableRow.updated_at),
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to get DuckDB table ${tableName}:`, error);
      throw error;
    }
  }

  async deleteTable(tableName: string): Promise<void> {
    try {
      if (!this.connectionInfo) {
        throw new Error('No active connection');
      }

      // Escape double quotes in identifier parts and quote them.
      // This is safe for typical DuckLake table names and avoids SQL injection.
      const escapedName = tableName.replace(/"/g, '""');
      await this.connectionInfo.connection.run(
        `DROP TABLE IF EXISTS "${escapedName}"`,
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to delete DuckDB table ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Get the metadata database prefix for qualifying metadata tables
   * @returns The prefix string (e.g., "__ducklake_metadata_test.main.") or empty string if not found
   */
  private async getMetadataPrefix(): Promise<string> {
    try {
      if (!this.connectionInfo) {
        return '';
      }

      const databasesQuery = `
        SELECT database_name
        FROM duckdb_databases()
        WHERE database_name LIKE '__ducklake_metadata_%'
        LIMIT 1
      `;

      const databasesResult =
        await this.connectionInfo.connection.run(databasesQuery);
      const databaseRows = await databasesResult.getRows();

      if (databaseRows.length === 0) {
        return '';
      }

      const metadataDatabase = Array.isArray(databaseRows[0])
        ? databaseRows[0][0]
        : (databaseRows[0] as any).database_name;

      return `"${metadataDatabase}".main.`;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Could not determine metadata prefix:', error);
      return '';
    }
  }

  /**
   * Qualify metadata table references in queries
   * This is needed for DuckDB adapter where metadata tables are in a separate attached database
   */
  private async qualifyMetadataTables(query: string): Promise<string> {
    const metadataPrefix = await this.getMetadataPrefix();

    if (!metadataPrefix) {
      return query;
    }

    // List of DuckLake metadata tables that need qualification
    const metadataTables = [
      'ducklake_table',
      'ducklake_column',
      'ducklake_schema',
      'ducklake_snapshot',
      'ducklake_data_file',
      'ducklake_delete_file',
      'ducklake_table_stats',
      'ducklake_table_column_stats',
      'ducklake_partition_info',
      'ducklake_partition_column',
      'ducklake_file_partition_value',
      'ducklake_tag',
      'ducklake_column_tag',
    ];

    // Replace unqualified metadata table references
    // Pattern: FROM/JOIN metadata_table (not already qualified)
    const qualifiedQuery = metadataTables.reduce((currentQuery, table) => {
      // Match FROM/JOIN followed by the table name, but not if already qualified
      const pattern = new RegExp(
        `\\b(FROM|JOIN)\\s+(?!"?__ducklake_metadata_)\\b${table}\\b`,
        'gi',
      );
      return currentQuery.replace(pattern, `$1 ${metadataPrefix}${table}`);
    }, query);

    return qualifiedQuery;
  }

  async executeQuery(
    request: DuckLakeQueryRequest,
  ): Promise<DuckLakeQueryResult> {
    const startTime = Date.now();
    try {
      if (!this.connectionInfo) {
        throw new Error('No active connection');
      }

      // Handle time travel queries
      const { query: baseQuery, snapshotId, limit, offset } = request;

      // Qualify metadata table references for internal queries
      let query = await this.qualifyMetadataTables(baseQuery);

      // Strip trailing semicolons before appending any suffixes (like SNAPSHOT or LIMIT/OFFSET).
      // Queries like "SELECT ... ORDER BY x;" would otherwise become
      // "SELECT ... ORDER BY x FOR SYSTEM_TIME..." which is a syntax error.
      query = query.replace(/;\s*$/, '');

      if (snapshotId) {
        // Modify query to use specific snapshot
        query = `${query} FOR SYSTEM_TIME AS OF SNAPSHOT '${snapshotId}'`;
      }

      let totalRows: number | undefined;

      // Add limit and offset if specified
      if (limit) {
        // If pagination is requested, calculate total rows for the base query.
        // Match SELECT queries and WITH-clause CTEs (WITH ... SELECT ...).
        // We intentionally exclude DML/DDL to avoid re-executing side-effecting statements.
        const isSelectQuery =
          /^\s*SELECT\b/i.test(query) || /^\s*WITH\b/i.test(query);

        // Respect user-defined LIMIT in their SQL — don't append another LIMIT
        // which would produce invalid syntax or override the user's intent.
        const hasExistingLimit = /\bLIMIT\s+\d+/i.test(query);

        if (isSelectQuery && !hasExistingLimit) {
          try {
            const countQuery = `SELECT COUNT(*) as total FROM (${query})`;
            const countResult =
              await this.connectionInfo.connection.run(countQuery);
            const countRows = await countResult.getRows();

            if (countRows && countRows.length > 0) {
              // Handle different result formats (array or object)
              const countRow = countRows[0];
              let countVal;

              if (Array.isArray(countRow)) {
                [countVal] = countRow;
              } else if (countRow && typeof countRow === 'object') {
                // Use nullish coalescing to properly handle zero values
                countVal = countRow.total ?? Object.values(countRow)[0];
              }

              if (countVal !== undefined) {
                totalRows = Number(countVal);
              }
            }
          } catch (error) {
            // eslint-disable-next-line no-console
            console.warn(
              '[DuckDB] Failed to fetch total rows for pagination:',
              error,
            );
          }

          query += ` LIMIT ${limit}`;
          if (offset) {
            query += ` OFFSET ${offset}`;
          }
        }
        // If hasExistingLimit or not a SELECT query: skip — LIMIT is invalid for DDL/DML
      }

      const result = await this.connectionInfo.connection.run(query);

      // Get column names and types using the correct DuckDB Node Neo API
      const columnNames = result.columnNames();
      const columnTypes = result.columnTypes();

      // Map to our field format
      const fields = columnNames.map((name: string, index: number) => ({
        name,
        type: columnTypes[index]?.toString() || 'UNKNOWN',
      }));

      const rows = await result.getRows();

      // Normalize data (handle HugeInt and other complex types)
      const data = rows.map((row: any) => {
        const normalized: any = {};
        if (Array.isArray(row)) {
          // If row is an array, map to field names
          columnNames.forEach((name: string, idx: number) => {
            const value = row[idx];
            // Only normalize numeric types (bigint, number, or objects with hugeint)
            // Preserve strings, booleans, nulls, and other types as-is
            if (
              typeof value === 'bigint' ||
              typeof value === 'number' ||
              (typeof value === 'object' &&
                value !== null &&
                (value as any).hugeint !== undefined)
            ) {
              normalized[name] = normalizeNumericValue(value);
            } else {
              normalized[name] = value;
            }
          });
        } else if (typeof row === 'object' && row !== null) {
          // If row is already an object
          const entries = Object.entries(row);
          entries.forEach(([key, value]) => {
            // Only normalize numeric types
            if (
              typeof value === 'bigint' ||
              typeof value === 'number' ||
              (typeof value === 'object' &&
                value !== null &&
                (value as any).hugeint !== undefined)
            ) {
              normalized[key] = normalizeNumericValue(value);
            } else {
              normalized[key] = value;
            }
          });
        }
        return normalized;
      });

      // Verify no BigInt remains after normalization (for debugging)
      if (data && data.length > 0) {
        data.slice(0, 3).forEach((row: any, rowIndex: number) => {
          Object.entries(row).forEach(([key, value]) => {
            if (typeof value === 'bigint') {
              // eslint-disable-next-line no-console
              log.error(
                `[DuckDB Adapter] ERROR: BigInt still present after normalization in row ${rowIndex}, column "${key}" (value omitted)`,
              );
            }
          });
        });
      }

      const duration = Date.now() - startTime;

      return {
        success: true,
        data,
        fields,
        rowCount: totalRows ?? data.length,
        duration,
        snapshotId,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to execute DuckDB query:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  async listSnapshots(tableName: string): Promise<DuckLakeSnapshotInfo[]> {
    try {
      if (!this.connectionInfo) {
        throw new Error('No active connection');
      }

      // Find the DuckLake metadata database
      const databasesQuery = `
        SELECT database_name
        FROM duckdb_databases()
        WHERE database_name LIKE '__ducklake_metadata_%'
        LIMIT 1
      `;

      const databasesResult =
        await this.connectionInfo.connection.run(databasesQuery);
      const databaseRows = await databasesResult.getRows();

      if (databaseRows.length === 0) {
        throw new Error('DuckLake metadata database not found');
      }

      const metadataDatabase = Array.isArray(databaseRows[0])
        ? databaseRows[0][0]
        : (databaseRows[0] as any).database_name;

      const quotedMetadataDatabase = `"${metadataDatabase}"`;
      const escapedTableName = tableName.replace(/'/g, "''");

      // 1. Get Table ID
      const tableIdQuery = `
        SELECT table_id
        FROM ${quotedMetadataDatabase}.main.ducklake_table
        WHERE table_name = '${escapedTableName}'
        ORDER BY begin_snapshot DESC
        LIMIT 1
      `;
      const tableIdResult =
        await this.connectionInfo.connection.run(tableIdQuery);
      const tableIdRows = await tableIdResult.getRows();

      if (tableIdRows.length === 0) {
        throw new Error(`Table not found: ${tableName}`);
      }

      const tableId = Array.isArray(tableIdRows[0])
        ? tableIdRows[0][0]
        : (tableIdRows[0] as any).table_id;

      const { hasAuthor, hasCommitMessage } =
        await this.getAvailableSnapshotColumns(metadataDatabase);

      const authorCol = hasAuthor ? 'sc.author' : 'NULL as author';
      const messageCol = hasCommitMessage
        ? 'sc.commit_message'
        : 'NULL as commit_message';

      // 2. Query Snapshots with Stats
      const query = `
        WITH table_snapshots AS (
          SELECT t.begin_snapshot as snapshot_id
          FROM ${quotedMetadataDatabase}.main.ducklake_table t
          WHERE t.table_id = ${tableId}
          UNION
          SELECT t.end_snapshot as snapshot_id
          FROM ${quotedMetadataDatabase}.main.ducklake_table t
          WHERE t.table_id = ${tableId} AND t.end_snapshot IS NOT NULL
          UNION
          SELECT df.begin_snapshot as snapshot_id
          FROM ${quotedMetadataDatabase}.main.ducklake_data_file df
          WHERE df.table_id = ${tableId}
          UNION
          SELECT df.end_snapshot as snapshot_id
          FROM ${quotedMetadataDatabase}.main.ducklake_data_file df
          WHERE df.table_id = ${tableId} AND df.end_snapshot IS NOT NULL
        )
        SELECT
          s.snapshot_id,
          s.snapshot_time,
          sc.changes_made,
          ${authorCol},
          ${messageCol},
          (SELECT COUNT(*) FROM ${quotedMetadataDatabase}.main.ducklake_data_file WHERE table_id = ${tableId} AND begin_snapshot = s.snapshot_id) as added_files,
          (SELECT COUNT(*) FROM ${quotedMetadataDatabase}.main.ducklake_data_file WHERE table_id = ${tableId} AND end_snapshot = s.snapshot_id) as deleted_files,
          (SELECT SUM(record_count) FROM ${quotedMetadataDatabase}.main.ducklake_data_file WHERE table_id = ${tableId} AND begin_snapshot = s.snapshot_id) as added_rows
        FROM ${quotedMetadataDatabase}.main.ducklake_snapshot s
        INNER JOIN table_snapshots ts ON s.snapshot_id = ts.snapshot_id
        LEFT JOIN ${quotedMetadataDatabase}.main.ducklake_snapshot_changes sc
          ON s.snapshot_id = sc.snapshot_id
        ORDER BY s.snapshot_id DESC
      `;

      const result = await this.connectionInfo.connection.run(query);
      const rows = await result.getRows();

      return rows.map((row: any) => {
        let snapshotId;
        let snapshotTime;
        let changesMade;
        let author;
        let commitMessage;
        let addedFiles;
        let deletedFiles;
        let addedRows;

        if (Array.isArray(row)) {
          [
            snapshotId,
            snapshotTime,
            changesMade,
            author,
            commitMessage,
            addedFiles,
            deletedFiles,
            addedRows,
          ] = row;
        } else {
          ({
            snapshot_id: snapshotId,
            snapshot_time: snapshotTime,
            changes_made: changesMade,
            author,
            commit_message: commitMessage,
            added_files: addedFiles,
            deleted_files: deletedFiles,
            added_rows: addedRows,
          } = row);
        }

        // Infer operation type
        let operation: any = 'append';
        if (changesMade && changesMade.toLowerCase().includes('delete')) {
          operation = 'delete';
        } else if (
          changesMade &&
          changesMade.toLowerCase().includes('update')
        ) {
          operation = 'update';
        } else if (deletedFiles > 0 && addedFiles > 0) {
          operation = 'replace'; // Likely compaction or overwrite
        }

        return {
          id: String(snapshotId),
          tableId: String(tableId),
          timestamp: new Date(snapshotTime),
          operation,
          author,
          commitMessage,
          summary: {
            addedFiles: Number(addedFiles) || 0,
            deletedFiles: Number(deletedFiles) || 0,
            addedRows: Number(addedRows) || 0,
            deletedRows: 0, // Not easily tracked without scanning delete files
            totalFiles: 0, // Would require window function or separate query
            totalRows: 0,
            totalSize: 0,
          },
        };
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to list snapshots for table ${tableName}:`, error);
      throw error;
    }
  }

  async listInstanceSnapshots(
    params: DuckLakeSnapshotParams,
  ): Promise<DuckLakePaginatedResult<DuckLakeSnapshotDetail>> {
    try {
      if (!this.connectionInfo) {
        throw new Error('No active connection');
      }

      const { page, pageSize, filter } = params;
      const offset = (page - 1) * pageSize;

      // Find the DuckLake metadata database
      const databasesQuery = `
        SELECT database_name
        FROM duckdb_databases()
        WHERE database_name LIKE '__ducklake_metadata_%'
        LIMIT 1
      `;

      const databasesResult =
        await this.connectionInfo.connection.run(databasesQuery);
      const databaseRows = await databasesResult.getRows();

      if (databaseRows.length === 0) {
        throw new Error('DuckLake metadata database not found');
      }

      const metadataDatabase = Array.isArray(databaseRows[0])
        ? databaseRows[0][0]
        : (databaseRows[0] as any).database_name;

      // Quote the database name to handle special characters (hyphens, etc.)
      const quotedMetadataDatabase = `"${metadataDatabase}"`;

      // Build WHERE clause
      // Build WHERE clause
      let whereClause = '';
      if (filter) {
        // Sanitize filter for simple SQL injection prevention
        // Escape LIKE wildcards first, then single quotes for SQL
        const safeFilter = filter
          .replace(/\\/g, '\\\\')
          .replace(/%/g, '\\%')
          .replace(/_/g, '\\_')
          .replace(/'/g, "''");
        whereClause = `
          WHERE CAST(s.snapshot_id AS VARCHAR) LIKE '%${safeFilter}%' ESCAPE '\\'
             OR sc.changes_made LIKE '%${safeFilter}%' ESCAPE '\\'
        `;
      }

      const { hasAuthor, hasCommitMessage, hasCommitExtraInfo } =
        await this.getAvailableSnapshotColumns(metadataDatabase);

      const authorCol = hasAuthor ? 'sc.author' : 'NULL as author';
      const messageCol = hasCommitMessage
        ? 'sc.commit_message'
        : 'NULL as commit_message';
      const extraInfoCol = hasCommitExtraInfo
        ? 'sc.commit_extra_info'
        : 'NULL as commit_extra_info';

      // 1. Get Total Count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM ${quotedMetadataDatabase}.main.ducklake_snapshot s
        LEFT JOIN ${quotedMetadataDatabase}.main.ducklake_snapshot_changes sc
          ON s.snapshot_id = sc.snapshot_id
        ${whereClause}
      `;

      const countResult = await this.connectionInfo.connection.run(countQuery);
      const countRows = await countResult.getRows();

      const totalRaw = Array.isArray(countRows[0])
        ? countRows[0][0]
        : countRows[0].total;
      const total = Number(String(totalRaw));

      // 2. Get Data with Pagination
      const snapshotsQuery = `
        SELECT
          s.snapshot_id,
          s.snapshot_time,
          s.schema_version,
          s.next_catalog_id,
          s.next_file_id,
          sc.changes_made,
          ${authorCol},
          ${messageCol},
          ${extraInfoCol}
        FROM ${quotedMetadataDatabase}.main.ducklake_snapshot s
        LEFT JOIN ${quotedMetadataDatabase}.main.ducklake_snapshot_changes sc
          ON s.snapshot_id = sc.snapshot_id
        ${whereClause}
        ORDER BY s.snapshot_id DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `;

      const snapshotsResult =
        await this.connectionInfo.connection.run(snapshotsQuery);
      const rows = await snapshotsResult.getRows();

      const data = rows.map((row: any) => {
        if (Array.isArray(row)) {
          return {
            snapshotId: row[0],
            snapshotTime: new Date(row[1]),
            schemaVersion: row[2],
            nextCatalogId: row[3],
            nextFileId: row[4],
            changesMade: row[5],
            author: row[6],
            commitMessage: row[7],
            commitExtraInfo: row[8],
          };
        }
        return {
          snapshotId: row.snapshot_id,
          snapshotTime: new Date(row.snapshot_time),
          schemaVersion: row.schema_version,
          nextCatalogId: row.next_catalog_id,
          nextFileId: row.next_file_id,
          changesMade: row.changes_made,
          author: row.author,
          commitMessage: row.commit_message,
          commitExtraInfo: row.commit_extra_info,
        };
      });

      return {
        data,
        total,
        page,
        pageSize,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to list instance snapshots:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive table details from DuckLake metadata catalog (Phase 8b)
   * Queries multiple metadata tables to provide complete table information
   */
  async getTableDetails(tableName: string): Promise<any> {
    try {
      if (!this.connectionInfo) {
        throw new Error('No active connection');
      }

      // Find the DuckLake metadata database
      const databasesQuery = `
        SELECT database_name
        FROM duckdb_databases()
        WHERE database_name LIKE '__ducklake_metadata_%'
        LIMIT 1
      `;

      const databasesResult =
        await this.connectionInfo.connection.run(databasesQuery);
      const databaseRows = await databasesResult.getRows();

      if (databaseRows.length === 0) {
        throw new Error('DuckLake metadata database not found');
      }

      const metadataDatabase = Array.isArray(databaseRows[0])
        ? databaseRows[0][0]
        : (databaseRows[0] as any).database_name;

      // Quote the database name to handle special characters (hyphens, etc.)
      const quotedMetadataDatabase = `"${metadataDatabase}"`;

      // Get current snapshot
      const currentSnapshotQuery = `
        SELECT COALESCE(MAX(snapshot_id), 0) as current_snapshot
        FROM ${quotedMetadataDatabase}.main.ducklake_snapshot
      `;
      const snapshotResult =
        await this.connectionInfo.connection.run(currentSnapshotQuery);
      const currentSnapshotRows = await snapshotResult.getRows();
      const currentSnapshot = Array.isArray(currentSnapshotRows[0])
        ? currentSnapshotRows[0][0]
        : currentSnapshotRows[0].current_snapshot;

      // Escape single quotes in table name for SQL safety
      const escapedTableName = tableName.replace(/'/g, "''");

      // 1. Get basic table info
      const tableQuery = `
        SELECT
          t.table_id,
          t.table_uuid,
          t.table_name,
          t.schema_id,
          s.schema_name,
          t.begin_snapshot,
          t.end_snapshot
        FROM ${quotedMetadataDatabase}.main.ducklake_table t
        JOIN ${quotedMetadataDatabase}.main.ducklake_schema s ON t.schema_id = s.schema_id
        WHERE t.table_name = '${escapedTableName}'
          AND ${currentSnapshot} >= t.begin_snapshot
          AND (${currentSnapshot} < t.end_snapshot OR t.end_snapshot IS NULL)
      `;

      const tableResult = await this.connectionInfo.connection.run(tableQuery);
      const tableRows = await tableResult.getRows();

      if (tableRows.length === 0) {
        throw new Error(`Table not found: ${tableName}`);
      }

      const tableRow = Array.isArray(tableRows[0])
        ? {
            table_id: tableRows[0][0],
            table_uuid: tableRows[0][1],
            table_name: tableRows[0][2],
            schema_id: tableRows[0][3],
            schema_name: tableRows[0][4],
            begin_snapshot: tableRows[0][5],
            end_snapshot: tableRows[0][6],
          }
        : tableRows[0];

      const tableId = tableRow.table_id;

      // 2. Get columns
      const columnsQuery = `
        SELECT
          column_id,
          column_name,
          column_type,
          column_order,
          nulls_allowed,
          default_value,
          initial_default,
          parent_column,
          begin_snapshot,
          end_snapshot
        FROM ${quotedMetadataDatabase}.main.ducklake_column
        WHERE table_id = ${tableId}
          AND ${currentSnapshot} >= begin_snapshot
          AND (${currentSnapshot} < end_snapshot OR end_snapshot IS NULL)
        ORDER BY column_order
      `;

      const columnsResult =
        await this.connectionInfo.connection.run(columnsQuery);
      const columnRows = await columnsResult.getRows();

      const columns = columnRows.map((col: any) => {
        if (Array.isArray(col)) {
          return {
            columnId: col[0],
            columnName: col[1],
            columnType: col[2],
            columnOrder: col[3],
            nullsAllowed: col[4],
            defaultValue: col[5],
            initialDefault: col[6],
            parentColumn: col[7],
            beginSnapshot: col[8],
            endSnapshot: col[9],
          };
        }
        return {
          columnId: col.column_id,
          columnName: col.column_name,
          columnType: col.column_type,
          columnOrder: col.column_order,
          nullsAllowed: col.nulls_allowed,
          defaultValue: col.default_value,
          initialDefault: col.initial_default,
          parentColumn: col.parent_column,
          beginSnapshot: col.begin_snapshot,
          endSnapshot: col.end_snapshot,
        };
      });

      // 3. Get table statistics
      const statsQuery = `
        SELECT
          record_count,
          next_row_id,
          file_size_bytes
        FROM ${quotedMetadataDatabase}.main.ducklake_table_stats
        WHERE table_id = ${tableId}
      `;

      const statsResult = await this.connectionInfo.connection.run(statsQuery);
      const statsRows = await statsResult.getRows();

      let stats;
      if (statsRows.length > 0) {
        if (Array.isArray(statsRows[0])) {
          stats = {
            tableId,
            recordCount: normalizeNumericValue(statsRows[0][0]) || 0,
            nextRowId: normalizeNumericValue(statsRows[0][1]) || 0,
            fileSizeBytes: normalizeNumericValue(statsRows[0][2]) || 0,
          };
        } else {
          stats = {
            tableId,
            recordCount: normalizeNumericValue(statsRows[0].record_count) || 0,
            nextRowId: normalizeNumericValue(statsRows[0].next_row_id) || 0,
            fileSizeBytes:
              normalizeNumericValue(statsRows[0].file_size_bytes) || 0,
          };
        }
      } else {
        stats = {
          tableId,
          recordCount: 0,
          nextRowId: 0,
          fileSizeBytes: 0,
        };
      }

      // 4. Get column statistics
      const columnStatsQuery = `
        SELECT
          cs.column_id,
          c.column_name,
          cs.contains_null,
          cs.contains_nan,
          cs.min_value,
          cs.max_value
        FROM ${quotedMetadataDatabase}.main.ducklake_table_column_stats cs
        JOIN ${quotedMetadataDatabase}.main.ducklake_column c
          ON cs.column_id = c.column_id
          AND cs.table_id = c.table_id
          AND ${currentSnapshot} >= c.begin_snapshot
          AND (${currentSnapshot} < c.end_snapshot OR c.end_snapshot IS NULL)
        WHERE cs.table_id = ${tableId}
      `;

      const columnStatsResult =
        await this.connectionInfo.connection.run(columnStatsQuery);
      const columnStatsRows = await columnStatsResult.getRows();

      const columnStats = columnStatsRows.map((row: any) => {
        if (Array.isArray(row)) {
          return {
            tableId,
            columnId: row[0],
            columnName: row[1],
            containsNull: row[2],
            containsNan: row[3],
            minValue: row[4],
            maxValue: row[5],
          };
        }
        return {
          tableId,
          columnId: row.column_id,
          columnName: row.column_name,
          containsNull: row.contains_null,
          containsNan: row.contains_nan,
          minValue: row.min_value,
          maxValue: row.max_value,
        };
      });

      // 5. Get data files
      const dataFilesQuery = `
        SELECT
          data_file_id,
          path,
          path_is_relative,
          file_format,
          record_count,
          file_size_bytes,
          footer_size,
          row_id_start,
          file_order,
          begin_snapshot,
          end_snapshot,
          partition_id
        FROM ${quotedMetadataDatabase}.main.ducklake_data_file
        WHERE table_id = ${tableId}
          AND ${currentSnapshot} >= begin_snapshot
          AND (${currentSnapshot} < end_snapshot OR end_snapshot IS NULL)
        ORDER BY file_order
      `;

      const dataFilesResult =
        await this.connectionInfo.connection.run(dataFilesQuery);
      const dataFileRows = await dataFilesResult.getRows();

      const dataFiles = dataFileRows.map((row: any) => {
        if (Array.isArray(row)) {
          return {
            dataFileId: row[0],
            tableId,
            path: row[1],
            pathIsRelative: row[2],
            fileFormat: row[3],
            recordCount: normalizeNumericValue(row[4]) || 0,
            fileSizeBytes: normalizeNumericValue(row[5]) || 0,
            footerSize: normalizeNumericValue(row[6]) || 0,
            rowIdStart: normalizeNumericValue(row[7]) || 0,
            fileOrder: normalizeNumericValue(row[8]) || 0,
            beginSnapshot: row[9],
            endSnapshot: row[10],
            partitionId: row[11],
          };
        }
        return {
          dataFileId: row.data_file_id,
          tableId,
          path: row.path,
          pathIsRelative: row.path_is_relative,
          fileFormat: row.file_format,
          recordCount: normalizeNumericValue(row.record_count) || 0,
          fileSizeBytes: normalizeNumericValue(row.file_size_bytes) || 0,
          footerSize: normalizeNumericValue(row.footer_size) || 0,
          rowIdStart: normalizeNumericValue(row.row_id_start) || 0,
          fileOrder: normalizeNumericValue(row.file_order) || 0,
          beginSnapshot: row.begin_snapshot,
          endSnapshot: row.end_snapshot,
          partitionId: row.partition_id,
        };
      });

      // 6. Get partition info (if exists)
      let partitionInfo;
      try {
        const partitionQuery = `
          SELECT
            partition_id,
            begin_snapshot,
            end_snapshot
          FROM ${quotedMetadataDatabase}.main.ducklake_partition_info
          WHERE table_id = ${tableId}
            AND ${currentSnapshot} >= begin_snapshot
            AND (${currentSnapshot} < end_snapshot OR end_snapshot IS NULL)
        `;

        const partitionResult =
          await this.connectionInfo.connection.run(partitionQuery);
        const partitionRows = await partitionResult.getRows();

        if (partitionRows.length > 0) {
          const partitionRow = Array.isArray(partitionRows[0])
            ? {
                partition_id: partitionRows[0][0],
                begin_snapshot: partitionRows[0][1],
                end_snapshot: partitionRows[0][2],
              }
            : partitionRows[0];

          const partitionId = partitionRow.partition_id;

          // Get partition columns
          const partitionColumnsQuery = `
            SELECT
              pc.partition_key_index,
              pc.column_id,
              c.column_name,
              pc.transform
            FROM ${quotedMetadataDatabase}.main.ducklake_partition_column pc
            JOIN ${quotedMetadataDatabase}.main.ducklake_column c
              ON pc.column_id = c.column_id
              AND pc.table_id = c.table_id
              AND ${currentSnapshot} >= c.begin_snapshot
              AND (${currentSnapshot} < c.end_snapshot OR c.end_snapshot IS NULL)
            WHERE pc.partition_id = ${partitionId} AND pc.table_id = ${tableId}
            ORDER BY pc.partition_key_index
          `;

          const partitionColumnsResult =
            await this.connectionInfo.connection.run(partitionColumnsQuery);
          const partitionColumnRows = await partitionColumnsResult.getRows();

          const partitionColumns = partitionColumnRows.map((row: any) => {
            if (Array.isArray(row)) {
              return {
                partitionId,
                tableId,
                partitionKeyIndex: row[0],
                columnId: row[1],
                columnName: row[2],
                transform: row[3],
              };
            }
            return {
              partitionId,
              tableId,
              partitionKeyIndex: row.partition_key_index,
              columnId: row.column_id,
              columnName: row.column_name,
              transform: row.transform,
            };
          });

          // Get file partition values
          const filePartitionValuesQuery = `
            SELECT
              data_file_id,
              partition_key_index,
              partition_value
            FROM ${quotedMetadataDatabase}.main.ducklake_file_partition_value
            WHERE table_id = ${tableId}
            ORDER BY data_file_id, partition_key_index
          `;

          const filePartitionValuesResult =
            await this.connectionInfo.connection.run(filePartitionValuesQuery);
          const filePartitionValueRows =
            await filePartitionValuesResult.getRows();

          const filePartitionValues = filePartitionValueRows.map((row: any) => {
            if (Array.isArray(row)) {
              return {
                dataFileId: row[0],
                tableId,
                partitionKeyIndex: row[1],
                partitionValue: row[2],
              };
            }
            return {
              dataFileId: row.data_file_id,
              tableId,
              partitionKeyIndex: row.partition_key_index,
              partitionValue: row.partition_value,
            };
          });

          partitionInfo = {
            partitionId,
            tableId,
            beginSnapshot: partitionRow.begin_snapshot,
            endSnapshot: partitionRow.end_snapshot,
            columns: partitionColumns,
            filePartitionValues,
          };
        }
      } catch (error) {
        // Partition info is optional
        // eslint-disable-next-line no-console
        console.debug('No partition info found for table:', tableName);
      }

      // 7. Get table-specific snapshots using CTE
      const { hasAuthor, hasCommitMessage, hasCommitExtraInfo } =
        await this.getAvailableSnapshotColumns(metadataDatabase);

      const authorCol = hasAuthor ? 'sc.author' : 'NULL as author';
      const messageCol = hasCommitMessage
        ? 'sc.commit_message'
        : 'NULL as commit_message';
      const extraInfoCol = hasCommitExtraInfo
        ? 'sc.commit_extra_info'
        : 'NULL as commit_extra_info';

      const snapshotsQuery = `
        WITH table_snapshots AS (
          -- Snapshot when table was created
          SELECT t.begin_snapshot as snapshot_id
          FROM ${quotedMetadataDatabase}.main.ducklake_table t
          WHERE t.table_id = ${tableId}

          UNION

          -- Snapshot when table was deleted (if applicable)
          SELECT t.end_snapshot as snapshot_id
          FROM ${quotedMetadataDatabase}.main.ducklake_table t
          WHERE t.table_id = ${tableId} AND t.end_snapshot IS NOT NULL

          UNION

          -- Snapshots when columns were added/modified
          SELECT c.begin_snapshot as snapshot_id
          FROM ${quotedMetadataDatabase}.main.ducklake_column c
          WHERE c.table_id = ${tableId}

          UNION

          -- Snapshots when columns were dropped
          SELECT c.end_snapshot as snapshot_id
          FROM ${quotedMetadataDatabase}.main.ducklake_column c
          WHERE c.table_id = ${tableId} AND c.end_snapshot IS NOT NULL

          UNION

          -- Snapshots when data files were added
          SELECT df.begin_snapshot as snapshot_id
          FROM ${quotedMetadataDatabase}.main.ducklake_data_file df
          WHERE df.table_id = ${tableId}

          UNION

          -- Snapshots when data files were deleted
          SELECT df.end_snapshot as snapshot_id
          FROM ${quotedMetadataDatabase}.main.ducklake_data_file df
          WHERE df.table_id = ${tableId} AND df.end_snapshot IS NOT NULL
        )
        SELECT
          s.snapshot_id,
          s.snapshot_time,
          s.schema_version,
          s.next_catalog_id,
          s.next_file_id,
          sc.changes_made,
          ${authorCol},
          ${messageCol},
          ${extraInfoCol}
        FROM ${quotedMetadataDatabase}.main.ducklake_snapshot s
        INNER JOIN table_snapshots ts ON s.snapshot_id = ts.snapshot_id
        LEFT JOIN ${quotedMetadataDatabase}.main.ducklake_snapshot_changes sc
          ON s.snapshot_id = sc.snapshot_id
        ORDER BY s.snapshot_id DESC
      `;

      const snapshotsResult =
        await this.connectionInfo.connection.run(snapshotsQuery);
      const snapshotRows = await snapshotsResult.getRows();

      const snapshots = snapshotRows.map((row: any) => {
        if (Array.isArray(row)) {
          return {
            snapshotId: row[0],
            snapshotTime: new Date(row[1]),
            schemaVersion: row[2],
            nextCatalogId: row[3],
            nextFileId: row[4],
            changesMade: row[5],
            author: row[6],
            commitMessage: row[7],
            commitExtraInfo: row[8],
          };
        }
        return {
          snapshotId: row.snapshot_id,
          snapshotTime: new Date(row.snapshot_time),
          schemaVersion: row.schema_version,
          nextCatalogId: row.next_catalog_id,
          nextFileId: row.next_file_id,
          changesMade: row.changes_made,
          author: row.author,
          commitMessage: row.commit_message,
          commitExtraInfo: row.commit_extra_info,
        };
      });

      // 8. Get table tags
      const tagsQuery = `
        SELECT
          key,
          value,
          begin_snapshot,
          end_snapshot
        FROM ${quotedMetadataDatabase}.main.ducklake_tag
        WHERE object_id = ${tableId}
          AND ${currentSnapshot} >= begin_snapshot
          AND (${currentSnapshot} < end_snapshot OR end_snapshot IS NULL)
      `;

      const tagsResult = await this.connectionInfo.connection.run(tagsQuery);
      const tagRows = await tagsResult.getRows();

      const tags = tagRows.map((row: any) => {
        if (Array.isArray(row)) {
          return {
            objectId: tableId,
            key: row[0],
            value: row[1],
            beginSnapshot: row[2],
            endSnapshot: row[3],
          };
        }
        return {
          objectId: tableId,
          key: row.key,
          value: row.value,
          beginSnapshot: row.begin_snapshot,
          endSnapshot: row.end_snapshot,
        };
      });

      // 9. Get column tags
      const columnTagsQuery = `
        SELECT
          ct.column_id,
          c.column_name,
          ct.key,
          ct.value,
          ct.begin_snapshot,
          ct.end_snapshot
        FROM ${quotedMetadataDatabase}.main.ducklake_column_tag ct
        JOIN ${quotedMetadataDatabase}.main.ducklake_column c
          ON ct.column_id = c.column_id
          AND ct.table_id = c.table_id
          AND ${currentSnapshot} >= c.begin_snapshot
          AND (${currentSnapshot} < c.end_snapshot OR c.end_snapshot IS NULL)
        WHERE ct.table_id = ${tableId}
          AND ${currentSnapshot} >= ct.begin_snapshot
          AND (${currentSnapshot} < ct.end_snapshot OR ct.end_snapshot IS NULL)
      `;

      const columnTagsResult =
        await this.connectionInfo.connection.run(columnTagsQuery);
      const columnTagRows = await columnTagsResult.getRows();

      const columnTags = columnTagRows.map((row: any) => {
        if (Array.isArray(row)) {
          return {
            tableId,
            columnId: row[0],
            columnName: row[1],
            key: row[2],
            value: row[3],
            beginSnapshot: row[4],
            endSnapshot: row[5],
          };
        }
        return {
          tableId,
          columnId: row.column_id,
          columnName: row.column_name,
          key: row.key,
          value: row.value,
          beginSnapshot: row.begin_snapshot,
          endSnapshot: row.end_snapshot,
        };
      });

      // Helper function to recursively convert all hugeint objects to numbers
      const convertHugeInts = (obj: any): any => {
        if (obj === null || obj === undefined) {
          return obj;
        }

        // Handle hugeint objects
        if (typeof obj === 'object' && obj.hugeint !== undefined) {
          return Number(String(obj.hugeint));
        }

        // Handle arrays
        if (Array.isArray(obj)) {
          return obj.map(convertHugeInts);
        }

        // Handle objects
        if (typeof obj === 'object') {
          const converted: any = {};
          Object.keys(obj).forEach((key) => {
            converted[key] = convertHugeInts(obj[key]);
          });
          return converted;
        }

        return obj;
      };

      // Assemble complete table details and convert all hugeints
      const result = {
        tableId,
        tableUuid: tableRow.table_uuid,
        tableName: tableRow.table_name,
        schemaId: tableRow.schema_id,
        schemaName: tableRow.schema_name,
        beginSnapshot: tableRow.begin_snapshot,
        endSnapshot: tableRow.end_snapshot,
        columns,
        stats,
        columnStats,
        dataFiles,
        partitionInfo,
        snapshots,
        tags,
        columnTags,
      };

      return convertHugeInts(result);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to get table details for ${tableName}:`, error);
      throw error;
    }
  }

  // eslint-disable-next-line class-methods-use-this
  getCatalogType(): string {
    return 'duckdb';
  }
}
