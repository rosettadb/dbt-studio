/**
 * SQLite Catalog Adapter
 * Implements DuckLake integration with SQLite file-based catalog
 */

import * as fs from 'fs';
import * as path from 'path';
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

export class SQLiteCatalogAdapter extends CatalogAdapter {
  async connect(
    config: DuckLakeCatalogConfig,
    instance: DuckLakeInstance,
    storageConfig?: DuckLakeStorageConfig,
  ): Promise<ConnectionInfo> {
    try {
      if (config.type !== 'sqlite') {
        throw DuckLakeError.unsupportedCatalog(config.type);
      }

      if (!config.sqlite?.metadataPath) {
        throw DuckLakeError.validation('SQLite metadata path is required');
      }

      // Initialize DuckDB instance
      const duckdbInstance = await this.initializeDuckDB(
        instance.runtimeOptions,
      );
      const connection = await duckdbInstance.connect();

      // Load DuckLake and SQLite extensions
      await this.loadDuckLakeExtension(connection);
      await this.loadCatalogExtensions(connection, ['sqlite']);

      // Create secrets for cloud storage
      await this.createSecrets(connection, storageConfig);

      // Ensure metadata directory exists
      const metadataDir = path.dirname(config.sqlite.metadataPath);
      if (!fs.existsSync(metadataDir)) {
        fs.mkdirSync(metadataDir, { recursive: true });
      }

      // Attach DuckLake catalog with SQLite backend
      const attachString = `ducklake:sqlite:${config.sqlite.metadataPath}`;
      await this.attachDuckLakeCatalog(
        connection,
        attachString,
        instance.name,
        instance.dataPath,
      );

      this.connectionInfo = {
        instance: duckdbInstance,
        connection,
        catalogType: 'sqlite',
        instanceName: instance.name,
        connectedAt: new Date(),
      };

      return this.connectionInfo;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('SQLite catalog connection failed:', error);
      throw DuckLakeError.catalogConnection(instance.id, error as Error);
    }
  }

  async restoreSnapshot(tableName: string, snapshotId: number): Promise<void> {
    try {
      if (!this.connectionInfo) {
        throw new Error('No active connection');
      }

      const escapedName = tableName.replace(/"/g, '""');
      await this.connectionInfo.connection.run(
        `CREATE OR REPLACE TABLE "${escapedName}" AS SELECT * FROM "${escapedName}" FOR SYSTEM_VERSION AS OF ${snapshotId}`,
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `Failed to restore SQLite table ${tableName} to snapshot ${snapshotId}:`,
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
        `Failed to add column ${columnName} to SQLite table ${tableName}:`,
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
        `Failed to drop column ${columnName} from SQLite table ${tableName}:`,
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
        `Failed to rename column ${oldColumnName} to ${newColumnName} on SQLite table ${tableName}:`,
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
        `Failed to alter column ${columnName} type to ${newType} on SQLite table ${tableName}:`,
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
        `Failed to set partition columns (${columnNames.join(', ')}) on SQLite table ${tableName}:`,
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
        `Failed to rename SQLite table ${oldName} to ${newName}:`,
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

      await this.connectionInfo.connection.run(updateQuery);
      const changesResult = await this.connectionInfo.connection.run(
        'SELECT changes() as changes',
      );
      const rows = await changesResult.getRows();
      const value = rows?.[0]?.[0] ?? 0;
      const numeric =
        typeof value === 'object' && value?.hugeint !== undefined
          ? Number(value.hugeint)
          : Number(value);

      return { rowsAffected: Number.isFinite(numeric) ? numeric : 0 };
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

      await this.connectionInfo.connection.run(deleteQuery);
      const changesResult = await this.connectionInfo.connection.run(
        'SELECT changes() as changes',
      );
      const rows = await changesResult.getRows();
      const value = rows?.[0]?.[0] ?? 0;
      const numeric =
        typeof value === 'object' && value?.hugeint !== undefined
          ? Number(value.hugeint)
          : Number(value);

      return { rowsAffected: Number.isFinite(numeric) ? numeric : 0 };
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

      await this.connectionInfo.connection.run(upsertQuery);
      const changesResult = await this.connectionInfo.connection.run(
        'SELECT changes() as changes',
      );
      const rows = await changesResult.getRows();
      const value = rows?.[0]?.[0] ?? 0;
      const numeric =
        typeof value === 'object' && value?.hugeint !== undefined
          ? Number(value.hugeint)
          : Number(value);

      return { rowsAffected: Number.isFinite(numeric) ? numeric : 0 };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to upsert rows:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.cleanup();
  }

  // eslint-disable-next-line class-methods-use-this
  async validateConfig(
    config: DuckLakeCatalogConfig,
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      if (config.type !== 'sqlite') {
        errors.push('Invalid catalog type for SQLite adapter');
        return { valid: false, errors, warnings };
      }

      if (!config.sqlite?.metadataPath) {
        errors.push('SQLite metadata path is required');
        return { valid: false, errors, warnings };
      }

      // Validate metadata path
      const { metadataPath } = config.sqlite;
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
      if (!metadataPath.endsWith('.sqlite') && !metadataPath.endsWith('.db')) {
        warnings.push(
          'SQLite metadata file should have .sqlite or .db extension',
        );
      }

      // Check for existing file locks (SQLite specific)
      const lockFile = `${metadataPath}-wal`;
      if (fs.existsSync(lockFile)) {
        warnings.push(
          'SQLite WAL file exists - database may be in use by another process',
        );
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('SQLite config validation error:', error);
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

      // Test DuckDB connection with SQLite extension
      testInstance = await this.initializeDuckDB();
      testConnection = await testInstance.connect();

      // Test DuckLake and SQLite extension loading
      await this.loadDuckLakeExtension(testConnection);
      await this.loadCatalogExtensions(testConnection, ['sqlite']);

      const responseTime = Date.now() - startTime;

      return {
        connected: true,
        lastChecked: new Date(),
        responseTime,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('SQLite connection test failed:', error);
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
          // eslint-disable-next-line no-console
          console.log('[SQLite] Closed test connection');
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Error closing test connection:', error);
        }
      }
      if (testInstance && typeof testInstance.close === 'function') {
        try {
          await testInstance.close();
          // eslint-disable-next-line no-console
          console.log('[SQLite] Closed test instance');
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
      console.error('SQLite health check failed:', error);
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
      if (!this.connectionInfo) {
        throw new Error('No active connection');
      }

      // Discover the DuckLake metadata database (attached DuckDB database)
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
        const allDatabasesResult = await this.connectionInfo.connection.run(
          'SELECT database_name FROM duckdb_databases()',
        );
        await allDatabasesResult.getRows();
        return [];
      }

      const metadataDatabase = Array.isArray(databaseRows[0])
        ? databaseRows[0][0]
        : (databaseRows[0] as any).database_name;

      const quotedMetadataDatabase = `"${metadataDatabase}"`;

      // List logical DuckLake tables from metadata tables, similar to DuckDB adapter
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
          ts.file_size_bytes
        FROM ${quotedMetadataDatabase}.main.ducklake_table t
        JOIN ${quotedMetadataDatabase}.main.ducklake_schema s ON t.schema_id = s.schema_id
        LEFT JOIN ${quotedMetadataDatabase}.main.ducklake_table_stats ts ON ts.table_id = t.table_id
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
          const [, tableName, schemaName, , , recordCount, fileSizeBytes] = row;
          return {
            name: tableName,
            schema: schemaName || 'main',
            instanceId: '',
            columns: [],
            snapshots: [],
            createdAt: new Date(),
            updatedAt: new Date(),
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
          createdAt: new Date(),
          updatedAt: new Date(),
          rowCount: normalizeNumericValue(row.record_count),
          sizeBytes: normalizeNumericValue(row.file_size_bytes),
        };
      });

      return tables;
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('Failed to list SQLite tables:', error);
      throw error;
    }
  }

  async getTable(tableName: string): Promise<DuckLakeTableInfo> {
    try {
      if (!this.connectionInfo) {
        throw new Error('No active connection');
      }

      // Escape single quotes in table name for SQL safety
      const escapedTableName = tableName.replace(/'/g, "''");

      // Get table metadata
      const tableQuery = `
        SELECT
          table_name,
          schema_name,
          created_at,
          updated_at
        FROM ducklake_table
        WHERE table_name = '${escapedTableName}'
      `;

      const tableResult = await this.connectionInfo.connection.run(tableQuery);
      const tableRows = await tableResult.getRows();

      if (tableRows.length === 0) {
        throw new Error(`Table not found: ${tableName}`);
      }

      const tableRow = tableRows[0];

      // Get column information
      const columnsQuery = `
        SELECT
          column_name,
          data_type,
          is_nullable,
          comment
        FROM ducklake_column
        WHERE table_name = '${escapedTableName}'
        ORDER BY ordinal_position
      `;

      const columnsResult =
        await this.connectionInfo.connection.run(columnsQuery);
      const columnRows = await columnsResult.getRows();

      const columns = columnRows.map((col: any) => ({
        name: col.column_name,
        type: col.data_type,
        nullable: col.is_nullable,
        comment: col.comment,
      }));

      return {
        name: tableRow.table_name,
        schema: tableRow.schema_name || 'main',
        instanceId: '', // Will be set by calling service
        columns,
        snapshots: [], // Will be populated by separate call
        createdAt: new Date(tableRow.created_at),
        updatedAt: new Date(tableRow.updated_at),
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to get SQLite table ${tableName}:`, error);
      throw error;
    }
  }

  async deleteTable(tableName: string): Promise<void> {
    try {
      if (!this.connectionInfo) {
        throw new Error('No active connection');
      }

      const escapedName = tableName.replace(/"/g, '""');
      await this.connectionInfo.connection.run(
        `DROP TABLE IF EXISTS "${escapedName}"`,
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to delete SQLite table ${tableName}:`, error);
      throw error;
    }
  }

  async executeQuery(
    request: DuckLakeQueryRequest,
  ): Promise<DuckLakeQueryResult> {
    try {
      if (!this.connectionInfo) {
        throw new Error('No active connection');
      }

      const startTime = Date.now();

      // Handle time travel queries
      let query = request.sql;
      if (request.snapshotId) {
        // Modify query to use specific snapshot
        query = `${query} FOR SYSTEM_TIME AS OF SNAPSHOT '${request.snapshotId}'`;
      }

      // Add limit and offset if specified
      if (request.limit) {
        query += ` LIMIT ${request.limit}`;
        if (request.offset) {
          query += ` OFFSET ${request.offset}`;
        }
      }

      const result = await this.connectionInfo.connection.run(query);
      const rows = await result.getRows();

      // Handle DDL statements (CREATE, DROP, etc.) that don't return a schema
      const columns = result.schema
        ? result.schema.map((col: any) => ({
            name: col.name,
            type: col.type,
          }))
        : [];

      const executionTime = Date.now() - startTime;

      return {
        columns,
        rows,
        executionTime,
        snapshotId: request.snapshotId,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('SQLite query execution failed:', error);
      throw error;
    }
  }

  async listSnapshots(tableName: string): Promise<DuckLakeSnapshotInfo[]> {
    try {
      if (!this.connectionInfo) {
        throw new Error('No active connection');
      }

      // Escape single quotes in table name for SQL safety
      const escapedTableName = tableName.replace(/'/g, "''");

      const query = `
        SELECT
          snapshot_id,
          table_id,
          timestamp_ms,
          operation,
          summary,
          parent_snapshot_id
        FROM ducklake_snapshot
        WHERE table_id = (
          SELECT table_id FROM ducklake_table WHERE table_name = '${escapedTableName}'
        )
        ORDER BY timestamp_ms DESC
      `;

      const result = await this.connectionInfo.connection.run(query);
      const rows = await result.getRows();

      return rows.map((row: any) => ({
        id: row.snapshot_id,
        tableId: row.table_id,
        timestamp: new Date(row.timestamp_ms),
        operation: row.operation,
        summary: JSON.parse(row.summary || '{}'),
        parentSnapshotId: row.parent_snapshot_id,
      }));
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

      // Quote the database name
      const quotedMetadataDatabase = `"${metadataDatabase}"`;

      // Build WHERE clause
      let whereClause = '';
      if (filter) {
        // Sanitize filter for simple SQL injection prevention (basic)
        // In real implementations, use bound parameters if possible, but DuckDB Node bindings might differ
        // For text search in snapshots
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
      // Handle count result safely for BigInt/Number
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
          sc.changes_made
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
          };
        }
        return {
          snapshotId: row.snapshot_id,
          snapshotTime: new Date(row.snapshot_time),
          schemaVersion: row.schema_version,
          nextCatalogId: row.next_catalog_id,
          nextFileId: row.next_file_id,
          changesMade: row.changes_made,
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
          sc.changes_made
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
          };
        }
        return {
          snapshotId: row.snapshot_id,
          snapshotTime: new Date(row.snapshot_time),
          schemaVersion: row.schema_version,
          nextCatalogId: row.next_catalog_id,
          nextFileId: row.next_file_id,
          changesMade: row.changes_made,
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
          // eslint-disable-next-line no-restricted-syntax
          for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
              converted[key] = convertHugeInts(obj[key]);
            }
          }
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
    return 'sqlite';
  }
}
