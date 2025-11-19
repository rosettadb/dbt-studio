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
  DuckLakeQueryResult,
  DuckLakeQueryRequest,
} from '../../../../types/duckLake';
import { DuckLakeError } from '../../../../types/duckLakeErrors';

export class SQLiteCatalogAdapter extends CatalogAdapter {
  async connect(
    config: DuckLakeCatalogConfig,
    instance: DuckLakeInstance,
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
        connectedAt: new Date(),
      };

      return this.connectionInfo;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('SQLite catalog connection failed:', error);
      throw DuckLakeError.catalogConnection(instance.id, error as Error);
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
      const testInstance = await this.initializeDuckDB();
      const testConnection = await testInstance.connect();

      try {
        // Test DuckLake and SQLite extension loading
        await this.loadDuckLakeExtension(testConnection);
        await this.loadCatalogExtensions(testConnection, ['sqlite']);

        const responseTime = Date.now() - startTime;

        return {
          connected: true,
          lastChecked: new Date(),
          responseTime,
        };
      } finally {
        // DuckDB Node.js API handles cleanup automatically
        // No explicit cleanup needed
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('SQLite connection test failed:', error);
      return {
        connected: false,
        lastChecked: new Date(),
        responseTime: Date.now() - startTime,
        error: (error as Error).message,
      };
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

      // Query DuckLake system tables for table list
      const query = `
        SELECT 
          table_name,
          schema_name,
          created_at,
          updated_at
        FROM ducklake_table 
        ORDER BY table_name
      `;

      const result = await this.connectionInfo.connection.run(query);
      const rows = await result.getRows();

      // Convert to DuckLakeTableInfo format
      const tables: DuckLakeTableInfo[] = rows.map((row: any) => ({
        name: row.table_name,
        schema: row.schema_name || 'main',
        instanceId: '', // Will be set by calling service
        columns: [], // Will be populated by separate call
        snapshots: [], // Will be populated by separate call
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      }));

      return tables;
    } catch (error) {
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

      // Get table metadata
      const tableQuery = `
        SELECT 
          table_name,
          schema_name,
          created_at,
          updated_at
        FROM ducklake_table 
        WHERE table_name = ?
      `;

      const tableResult = await this.connectionInfo.connection.run(
        tableQuery,
        tableName,
      );
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
        WHERE table_name = ?
        ORDER BY ordinal_position
      `;

      const columnsResult = await this.connectionInfo.connection.run(
        columnsQuery,
        tableName,
      );
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
      const columns = result.schema.map((col: any) => ({
        name: col.name,
        type: col.type,
      }));

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
          SELECT table_id FROM ducklake_table WHERE table_name = ?
        )
        ORDER BY timestamp_ms DESC
      `;

      const result = await this.connectionInfo.connection.run(query, tableName);
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

  // eslint-disable-next-line class-methods-use-this
  getCatalogType(): string {
    return 'sqlite';
  }
}
