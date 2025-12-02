/**
 * DuckLake Validation Service
 * Validates instance configurations and catalog settings
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  DuckLakeInstanceCreateRequest,
  DuckLakeInstanceUpdateRequest,
  DuckLakeCatalogConfig,
  DuckLakeStorageConfig,
} from '../../../types/duckLake';
import { DuckLakeError } from '../../../types/duckLakeErrors';

export default class DuckLakeValidationService {
  /**
   * Validate instance creation request
   */
  static validateCreateRequest(request: DuckLakeInstanceCreateRequest): void {
    // Validate required fields
    if (!request.name || request.name.trim().length === 0) {
      throw DuckLakeError.validation('Instance name is required', 'name');
    }

    if (request.name.length > 100) {
      throw DuckLakeError.validation(
        'Instance name must be 100 characters or less',
        'name',
      );
    }

    // Validate name format (alphanumeric, hyphens, underscores only)
    if (!/^[a-zA-Z0-9_-]+$/.test(request.name)) {
      throw DuckLakeError.validation(
        'Instance name can only contain letters, numbers, hyphens, and underscores',
        'name',
      );
    }

    if (!request.dataPath || request.dataPath.trim().length === 0) {
      throw DuckLakeError.validation('Data path is required', 'dataPath');
    }

    // Validate data path format
    if (
      !path.isAbsolute(request.dataPath) &&
      !request.dataPath.startsWith('s3://') &&
      !request.dataPath.startsWith('abfss://') &&
      !request.dataPath.startsWith('gs://')
    ) {
      throw DuckLakeError.validation(
        'Data path must be an absolute path or a valid cloud URI',
        'dataPath',
      );
    }

    // Validate description length
    if (request.description && request.description.length > 500) {
      throw DuckLakeError.validation(
        'Description must be 500 characters or less',
        'description',
      );
    }

    // Validate tags
    if (request.tags) {
      if (request.tags.length > 10) {
        throw DuckLakeError.validation('Maximum 10 tags allowed', 'tags');
      }

      request.tags.forEach((tag) => {
        if (!tag || tag.trim().length === 0) {
          throw DuckLakeError.validation('Tags cannot be empty', 'tags');
        }
        if (tag.length > 50) {
          throw DuckLakeError.validation(
            'Each tag must be 50 characters or less',
            'tags',
          );
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(tag)) {
          throw DuckLakeError.validation(
            'Tags can only contain letters, numbers, hyphens, and underscores',
            'tags',
          );
        }
      });
    }

    // Validate catalog configuration
    this.validateCatalogConfig(request.catalog);

    // Validate storage configuration
    if (request.storage) {
      this.validateStorageConfig(request.storage);
      this.validateStorageAndDataPath(request.storage, request.dataPath);
    }

    // Validate runtime options
    if (request.runtimeOptions) {
      this.validateRuntimeOptions(request.runtimeOptions);
    }
  }

  /**
   * Validate instance update request
   */
  static validateUpdateRequest(request: DuckLakeInstanceUpdateRequest): void {
    // Only validate provided fields
    if (request.name !== undefined) {
      if (!request.name || request.name.trim().length === 0) {
        throw DuckLakeError.validation('Instance name cannot be empty', 'name');
      }

      if (request.name.length > 100) {
        throw DuckLakeError.validation(
          'Instance name must be 100 characters or less',
          'name',
        );
      }

      if (!/^[a-zA-Z0-9_-]+$/.test(request.name)) {
        throw DuckLakeError.validation(
          'Instance name can only contain letters, numbers, hyphens, and underscores',
          'name',
        );
      }
    }

    if (request.dataPath !== undefined) {
      if (!request.dataPath || request.dataPath.trim().length === 0) {
        throw DuckLakeError.validation('Data path cannot be empty', 'dataPath');
      }

      if (
        !path.isAbsolute(request.dataPath) &&
        !request.dataPath.startsWith('s3://') &&
        !request.dataPath.startsWith('abfss://') &&
        !request.dataPath.startsWith('gs://')
      ) {
        throw DuckLakeError.validation(
          'Data path must be an absolute path or a valid cloud URI',
          'dataPath',
        );
      }
    }

    if (request.description !== undefined && request.description.length > 500) {
      throw DuckLakeError.validation(
        'Description must be 500 characters or less',
        'description',
      );
    }

    if (request.tags !== undefined) {
      if (request.tags.length > 10) {
        throw DuckLakeError.validation('Maximum 10 tags allowed', 'tags');
      }

      request.tags.forEach((tag) => {
        if (!tag || tag.trim().length === 0) {
          throw DuckLakeError.validation('Tags cannot be empty', 'tags');
        }
        if (tag.length > 50) {
          throw DuckLakeError.validation(
            'Each tag must be 50 characters or less',
            'tags',
          );
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(tag)) {
          throw DuckLakeError.validation(
            'Tags can only contain letters, numbers, hyphens, and underscores',
            'tags',
          );
        }
      });
    }

    if (request.catalog !== undefined) {
      this.validateCatalogConfig(request.catalog);
    }

    if (request.storage !== undefined) {
      this.validateStorageConfig(request.storage);
      // If dataPath is also provided, validate consistency
      if (request.dataPath) {
        this.validateStorageAndDataPath(request.storage, request.dataPath);
      }
    }

    if (request.runtimeOptions !== undefined) {
      this.validateRuntimeOptions(request.runtimeOptions);
    }
  }

  /**
   * Validate catalog configuration
   */
  static validateCatalogConfig(catalog: DuckLakeCatalogConfig): void {
    if (!catalog || !catalog.type) {
      throw DuckLakeError.validation(
        'Catalog type is required',
        'catalog.type',
      );
    }

    switch (catalog.type) {
      case 'duckdb':
        this.validateDuckDBConfig(catalog);
        break;
      case 'sqlite':
        this.validateSQLiteConfig(catalog);
        break;
      case 'postgresql':
        this.validatePostgreSQLConfig(catalog);
        break;

      default:
        throw DuckLakeError.validation(
          `Unsupported catalog type: ${catalog.type}`,
          'catalog.type',
        );
    }
  }

  /**
   * Validate DuckDB catalog configuration
   */
  private static validateDuckDBConfig(catalog: DuckLakeCatalogConfig): void {
    if (!catalog.duckdb) {
      throw DuckLakeError.validation(
        'DuckDB configuration is required',
        'catalog.duckdb',
      );
    }

    if (
      !catalog.duckdb.metadataPath ||
      catalog.duckdb.metadataPath.trim().length === 0
    ) {
      throw DuckLakeError.validation(
        'DuckDB metadata path is required',
        'catalog.duckdb.metadataPath',
      );
    }

    if (!path.isAbsolute(catalog.duckdb.metadataPath)) {
      throw DuckLakeError.validation(
        'DuckDB metadata path must be an absolute path',
        'catalog.duckdb.metadataPath',
      );
    }

    // Validate file extension
    if (
      !catalog.duckdb.metadataPath.endsWith('.db') &&
      !catalog.duckdb.metadataPath.endsWith('.duckdb')
    ) {
      throw DuckLakeError.validation(
        'DuckDB metadata path should end with .db or .duckdb extension',
        'catalog.duckdb.metadataPath',
      );
    }
  }

  /**
   * Validate SQLite catalog configuration
   */
  private static validateSQLiteConfig(catalog: DuckLakeCatalogConfig): void {
    if (!catalog.sqlite) {
      throw DuckLakeError.validation(
        'SQLite configuration is required',
        'catalog.sqlite',
      );
    }

    if (
      !catalog.sqlite.metadataPath ||
      catalog.sqlite.metadataPath.trim().length === 0
    ) {
      throw DuckLakeError.validation(
        'SQLite metadata path is required',
        'catalog.sqlite.metadataPath',
      );
    }

    if (!path.isAbsolute(catalog.sqlite.metadataPath)) {
      throw DuckLakeError.validation(
        'SQLite metadata path must be an absolute path',
        'catalog.sqlite.metadataPath',
      );
    }

    // Validate file extension
    if (
      !catalog.sqlite.metadataPath.endsWith('.db') &&
      !catalog.sqlite.metadataPath.endsWith('.sqlite')
    ) {
      throw DuckLakeError.validation(
        'SQLite metadata path should end with .db or .sqlite extension',
        'catalog.sqlite.metadataPath',
      );
    }
  }

  /**
   * Validate PostgreSQL catalog configuration
   */
  private static validatePostgreSQLConfig(
    catalog: DuckLakeCatalogConfig,
  ): void {
    if (!catalog.postgresql) {
      throw DuckLakeError.validation(
        'PostgreSQL configuration is required',
        'catalog.postgresql',
      );
    }

    const pg = catalog.postgresql;

    if (!pg.host || pg.host.trim().length === 0) {
      throw DuckLakeError.validation(
        'PostgreSQL host is required',
        'catalog.postgresql.host',
      );
    }

    if (!pg.port || pg.port < 1 || pg.port > 65535) {
      throw DuckLakeError.validation(
        'PostgreSQL port must be between 1 and 65535',
        'catalog.postgresql.port',
      );
    }

    if (!pg.database || pg.database.trim().length === 0) {
      throw DuckLakeError.validation(
        'PostgreSQL database name is required',
        'catalog.postgresql.database',
      );
    }

    if (!pg.username || pg.username.trim().length === 0) {
      throw DuckLakeError.validation(
        'PostgreSQL username is required',
        'catalog.postgresql.username',
      );
    }

    // Validate database name format
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(pg.database)) {
      throw DuckLakeError.validation(
        'PostgreSQL database name must start with a letter or underscore and contain only letters, numbers, and underscores',
        'catalog.postgresql.database',
      );
    }

    // Validate username format
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(pg.username)) {
      throw DuckLakeError.validation(
        'PostgreSQL username must start with a letter or underscore and contain only letters, numbers, and underscores',
        'catalog.postgresql.username',
      );
    }
  }

  /**
   * Validate runtime options
   */
  private static validateRuntimeOptions(options: any): void {
    if (options.maxMemory !== undefined) {
      if (typeof options.maxMemory !== 'string') {
        throw DuckLakeError.validation(
          'Max memory must be a string',
          'runtimeOptions.maxMemory',
        );
      }

      // Validate memory format (e.g., "1GB", "512MB")
      if (!/^\d+[KMGT]?B?$/i.test(options.maxMemory)) {
        throw DuckLakeError.validation(
          'Max memory must be in format like "1GB", "512MB", "2048KB"',
          'runtimeOptions.maxMemory',
        );
      }
    }

    if (options.threads !== undefined) {
      if (
        !Number.isInteger(options.threads) ||
        options.threads < 1 ||
        options.threads > 64
      ) {
        throw DuckLakeError.validation(
          'Threads must be an integer between 1 and 64',
          'runtimeOptions.threads',
        );
      }
    }

    if (options.enableOptimizer !== undefined) {
      if (typeof options.enableOptimizer !== 'boolean') {
        throw DuckLakeError.validation(
          'Enable optimizer must be a boolean',
          'runtimeOptions.enableOptimizer',
        );
      }
    }

    if (options.tempDirectory !== undefined) {
      if (
        typeof options.tempDirectory !== 'string' ||
        options.tempDirectory.trim().length === 0
      ) {
        throw DuckLakeError.validation(
          'Temp directory must be a non-empty string',
          'runtimeOptions.tempDirectory',
        );
      }

      if (!path.isAbsolute(options.tempDirectory)) {
        throw DuckLakeError.validation(
          'Temp directory must be an absolute path',
          'runtimeOptions.tempDirectory',
        );
      }
    }
  }

  /**
   * Validate data path accessibility
   */
  static async validateDataPathAccess(dataPath: string): Promise<void> {
    // Skip validation for cloud paths (s3://, abfss://, gs://)
    // These will be validated by connection tests
    if (
      dataPath.startsWith('s3://') ||
      dataPath.startsWith('abfss://') ||
      dataPath.startsWith('gs://')
    ) {
      return;
    }

    try {
      // Check if path exists
      if (!fs.existsSync(dataPath)) {
        // Try to create the directory
        try {
          fs.mkdirSync(dataPath, { recursive: true });
        } catch (error) {
          throw DuckLakeError.validation(
            `Cannot create data path: ${(error as Error).message}`,
            'dataPath',
          );
        }
      }

      // Check if path is a directory
      const stats = fs.statSync(dataPath);
      if (!stats.isDirectory()) {
        throw DuckLakeError.validation(
          'Data path must be a directory',
          'dataPath',
        );
      }

      // Check write permissions by creating a test file
      const testFile = path.join(dataPath, '.ducklake-test');
      try {
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
      } catch (error) {
        throw DuckLakeError.validation(
          `Data path is not writable: ${(error as Error).message}`,
          'dataPath',
        );
      }
    } catch (error) {
      if (error instanceof DuckLakeError) {
        throw error;
      }
      throw DuckLakeError.validation(
        `Data path validation failed: ${(error as Error).message}`,
        'dataPath',
      );
    }
  }

  /**
   * Validate catalog metadata path accessibility
   */
  static async validateCatalogPathAccess(
    catalog: DuckLakeCatalogConfig,
  ): Promise<void> {
    try {
      if (catalog.type === 'duckdb' && catalog.duckdb) {
        await this.validateMetadataFileAccess(
          catalog.duckdb.metadataPath,
          'DuckDB',
        );
      } else if (catalog.type === 'sqlite' && catalog.sqlite) {
        await this.validateMetadataFileAccess(
          catalog.sqlite.metadataPath,
          'SQLite',
        );
      }
      // PostgreSQL doesn't need file path validation
    } catch (error) {
      if (error instanceof DuckLakeError) {
        throw error;
      }
      throw DuckLakeError.validation(
        `Catalog path validation failed: ${(error as Error).message}`,
        'catalog',
      );
    }
  }

  /**
   * Validate metadata file accessibility
   */
  private static async validateMetadataFileAccess(
    filePath: string,
    catalogType: string,
  ): Promise<void> {
    const directory = path.dirname(filePath);

    // Check if directory exists, create if needed
    if (!fs.existsSync(directory)) {
      try {
        fs.mkdirSync(directory, { recursive: true });
      } catch (error) {
        throw DuckLakeError.validation(
          `Cannot create ${catalogType} metadata directory: ${(error as Error).message}`,
          'catalog',
        );
      }
    }

    // Check directory write permissions
    try {
      const testFile = path.join(directory, '.ducklake-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
    } catch (error) {
      throw DuckLakeError.validation(
        `${catalogType} metadata directory is not writable: ${(error as Error).message}`,
        'catalog',
      );
    }
  }

  /**
   * Validate storage configuration
   */
  static validateStorageConfig(storage: DuckLakeStorageConfig): void {
    if (!storage.type) {
      throw DuckLakeError.validation(
        'Storage type is required',
        'storage.type',
      );
    }

    switch (storage.type) {
      case 'local':
        if (!storage.local?.path) {
          throw DuckLakeError.validation(
            'Local storage path is required',
            'storage.local.path',
          );
        }
        if (!path.isAbsolute(storage.local.path)) {
          throw DuckLakeError.validation(
            'Local storage path must be absolute',
            'storage.local.path',
          );
        }
        break;

      case 's3':
        if (!storage.s3) {
          throw DuckLakeError.validation(
            'S3 configuration is required',
            'storage.s3',
          );
        }
        if (!storage.s3.bucket) {
          throw DuckLakeError.validation(
            'S3 bucket is required',
            'storage.s3.bucket',
          );
        }
        if (!storage.s3.region) {
          throw DuckLakeError.validation(
            'S3 region is required',
            'storage.s3.region',
          );
        }
        if (!storage.s3.accessKeyId) {
          throw DuckLakeError.validation(
            'S3 access key ID is required',
            'storage.s3.accessKeyId',
          );
        }
        break;

      case 'azure':
        if (!storage.azure) {
          throw DuckLakeError.validation(
            'Azure configuration is required',
            'storage.azure',
          );
        }
        if (!storage.azure.container) {
          throw DuckLakeError.validation(
            'Azure container is required',
            'storage.azure.container',
          );
        }
        if (
          !storage.azure.connectionString &&
          (!storage.azure.accountName || !storage.azure.accountKey)
        ) {
          throw DuckLakeError.validation(
            'Azure connection string or account name/key is required',
            'storage.azure',
          );
        }
        break;

      case 'gcs':
        if (!storage.gcs) {
          throw DuckLakeError.validation(
            'GCS configuration is required',
            'storage.gcs',
          );
        }
        if (!storage.gcs.bucket) {
          throw DuckLakeError.validation(
            'GCS bucket is required',
            'storage.gcs.bucket',
          );
        }
        if (!storage.gcs.projectId) {
          throw DuckLakeError.validation(
            'GCS project ID is required',
            'storage.gcs.projectId',
          );
        }
        break;

      default:
        throw DuckLakeError.validation(
          `Unsupported storage type: ${storage.type}`,
          'storage.type',
        );
    }
  }

  /**
   * Validate consistency between storage config and data path
   */
  static validateStorageAndDataPath(
    storage: DuckLakeStorageConfig,
    dataPath: string,
  ): void {
    switch (storage.type) {
      case 'local':
        if (dataPath !== storage.local?.path) {
          if (!path.isAbsolute(dataPath)) {
            throw DuckLakeError.validation(
              'Data path must be absolute for local storage',
              'dataPath',
            );
          }
        }
        break;
      case 's3':
        if (!dataPath.startsWith('s3://')) {
          throw DuckLakeError.validation(
            'Data path must start with s3:// for S3 storage',
            'dataPath',
          );
        }
        break;
      case 'azure':
        if (
          !dataPath.startsWith('abfss://') &&
          !dataPath.startsWith('azure://')
        ) {
          throw DuckLakeError.validation(
            'Data path must start with abfss:// for Azure storage',
            'dataPath',
          );
        }
        break;
      case 'gcs':
        if (!dataPath.startsWith('gs://')) {
          throw DuckLakeError.validation(
            'Data path must start with gs:// for GCS storage',
            'dataPath',
          );
        }
        break;
      default:
        throw DuckLakeError.validation(
          `Unsupported storage type: ${storage.type}`,
          'storage.type',
        );
    }
  }
}
