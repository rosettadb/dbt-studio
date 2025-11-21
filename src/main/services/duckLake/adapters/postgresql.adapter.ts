/**
 * PostgreSQL Catalog Adapter
 * Implements DuckLake integration with PostgreSQL database catalog
 */

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
  DuckLakeStorageConfig,
} from '../../../../types/duckLake';
import { DuckLakeError } from '../../../../types/duckLakeErrors';
import { normalizeNumericValue } from '../../../../renderer/utils/fileUtils';

export class PostgreSQLCatalogAdapter extends CatalogAdapter {
  async connect(
    config: DuckLakeCatalogConfig,
    instance: DuckLakeInstance,
    storageConfig?: DuckLakeStorageConfig,
  ): Promise<ConnectionInfo> {
    try {
      if (config.type !== 'postgresql') {
        throw DuckLakeError.unsupportedCatalog(config.type);
      }

      if (!config.postgresql) {
        throw DuckLakeError.validation('PostgreSQL configuration is required');
      }

      const pgConfig = config.postgresql;

      // Initialize DuckDB instance
      const duckdbInstance = await this.initializeDuckDB(
        instance.runtimeOptions,
      );
      const connection = await duckdbInstance.connect();

      // Load DuckLake and PostgreSQL extensions
      await this.loadDuckLakeExtension(connection);
      await this.loadCatalogExtensions(connection, ['postgres']);

      // Create secrets for cloud storage (httpfs, azure, etc.)
      // This will also handle S3 httpfs secrets when storageConfig.type === 's3'.
      await this.createSecrets(connection, storageConfig);

      // Build PostgreSQL connection string
      const connectionString = this.buildPostgreSQLConnectionString(pgConfig);

      // Attach DuckLake catalog with PostgreSQL backend
      const attachString = `ducklake:postgres:${connectionString}`;

      // For S3 storage we expect instance.dataPath to be an s3:// URI such as
      // s3://adaptivescale/ducklake_nuri/ and rely on httpfs + secret created
      // via createSecrets above. We just pass through instance.dataPath here.
      await this.attachDuckLakeCatalog(
        connection,
        attachString,
        instance.name,
        instance.dataPath,
      );

      this.connectionInfo = {
        instance: duckdbInstance,
        connection,
        catalogType: 'postgresql',
        instanceName: instance.name,
        connectedAt: new Date(),
      };

      return this.connectionInfo;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('PostgreSQL catalog connection failed:', error);
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
      if (config.type !== 'postgresql') {
        errors.push('Invalid catalog type for PostgreSQL adapter');
        return { valid: false, errors, warnings };
      }

      if (!config.postgresql) {
        errors.push('PostgreSQL configuration is required');
        return { valid: false, errors, warnings };
      }

      const pgConfig = config.postgresql;

      // Validate required fields
      if (!pgConfig.host) {
        errors.push('PostgreSQL host is required');
      }

      if (!pgConfig.port || pgConfig.port < 1 || pgConfig.port > 65535) {
        errors.push('PostgreSQL port must be between 1 and 65535');
      }

      if (!pgConfig.database) {
        errors.push('PostgreSQL database name is required');
      }

      if (!pgConfig.username) {
        errors.push('PostgreSQL username is required');
      }

      // Validate SSL settings
      if (!pgConfig.ssl) {
        warnings.push('SSL is disabled - consider enabling for production use');
      }

      // Validate host format
      if (pgConfig.host && !this.isValidHostname(pgConfig.host)) {
        warnings.push('Host format may be invalid');
      }

      // Check for common security issues
      if (pgConfig.username === 'postgres') {
        warnings.push(
          'Using default postgres user - consider using a dedicated user',
        );
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('PostgreSQL config validation error:', error);
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

      // Test DuckDB connection with PostgreSQL extension
      const testInstance = await this.initializeDuckDB();
      const testConnection = await testInstance.connect();

      try {
        // Test DuckLake and PostgreSQL extension loading
        await this.loadDuckLakeExtension(testConnection);
        await this.loadCatalogExtensions(testConnection, ['postgres']);

        // Test PostgreSQL connection
        const pgConfig = config.postgresql!;
        const connectionString = this.buildPostgreSQLConnectionString(pgConfig);

        // Test basic PostgreSQL connection
        const testQuery = `SELECT 1 FROM postgres_query('${connectionString}', 'SELECT 1 as test')`;
        await testConnection.run(testQuery);

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
      console.error('PostgreSQL connection test failed:', error);
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
      console.error('PostgreSQL health check failed:', error);
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

      const query = `
        WITH current_snapshot AS (
          SELECT COALESCE(max(snapshot_id), 0) as snapshot_id
          FROM ${quotedMetadataDatabase}.ducklake_snapshot
        )
        SELECT
          t.table_id,
          t.table_name,
          s.schema_name,
          t.table_uuid,
          cs.snapshot_id as current_snapshot,
          ts.record_count,
          ts.file_size_bytes
        FROM ${quotedMetadataDatabase}.ducklake_table t
        JOIN ${quotedMetadataDatabase}.ducklake_schema s ON t.schema_id = s.schema_id
        LEFT JOIN ${quotedMetadataDatabase}.ducklake_table_stats ts ON ts.table_id = t.table_id
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
            schema: schemaName || 'public',
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
          schema: row.schema_name || 'public',
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
      const errorMessage = error.message || '';

      if (
        errorMessage.includes('ducklake_snapshot does not exist') ||
        errorMessage.includes('ducklake_table does not exist') ||
        errorMessage.includes('Catalog Error')
      ) {
        return [];
      }

      // eslint-disable-next-line no-console
      console.error('Failed to list PostgreSQL tables:', error);
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
        schema: tableRow.schema_name || 'public',
        instanceId: '', // Will be set by calling service
        columns,
        snapshots: [], // Will be populated by separate call
        createdAt: new Date(tableRow.created_at),
        updatedAt: new Date(tableRow.updated_at),
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to get PostgreSQL table ${tableName}:`, error);
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
      console.error('PostgreSQL query execution failed:', error);
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
    return 'postgresql';
  }

  /**
   * Build PostgreSQL connection string from config
   */
  // eslint-disable-next-line class-methods-use-this
  private buildPostgreSQLConnectionString(
    config: NonNullable<DuckLakeCatalogConfig['postgresql']>,
  ): string {
    const parts = [
      `dbname=${config.database}`,
      `host=${config.host}`,
      `port=${config.port}`,
      `user=${config.username}`,
    ];

    if (config.password) {
      parts.push(`password=${config.password}`);
    }

    if (config.ssl) {
      parts.push('sslmode=require');
    } else {
      parts.push('sslmode=disable');
    }

    return parts.join(' ');
  }

  /**
   * Validate hostname format
   */
  // eslint-disable-next-line class-methods-use-this
  private isValidHostname(hostname: string): boolean {
    // Basic hostname validation
    const hostnameRegex =
      /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    const ipRegex =
      /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

    return (
      hostnameRegex.test(hostname) ||
      ipRegex.test(hostname) ||
      hostname === 'localhost'
    );
  }
}
