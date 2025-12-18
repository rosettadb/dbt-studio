/**
 * DuckLake Error Factory
 * Single class with static methods for creating different types of DuckLake errors
 */

export class DuckLakeError extends Error {
  constructor(
    message: string,
    public code: string,
    public instanceId?: string,
    public cause?: Error,
  ) {
    super(message);
    this.name = 'DuckLakeError';
  }

  /**
   * Create an unsupported catalog error
   */
  static unsupportedCatalog(catalogType: string): DuckLakeError {
    return new DuckLakeError(
      `Unsupported catalog type: ${catalogType}`,
      'UNSUPPORTED_CATALOG',
    );
  }

  /**
   * Create an instance not found error
   */
  static instanceNotFound(instanceId: string): DuckLakeError {
    return new DuckLakeError(
      `DuckLake instance not found: ${instanceId}`,
      'INSTANCE_NOT_FOUND',
      instanceId,
    );
  }

  /**
   * Create a catalog connection error
   */
  static catalogConnection(instanceId: string, cause?: Error): DuckLakeError {
    return new DuckLakeError(
      `Failed to connect to catalog for instance: ${instanceId}`,
      'CATALOG_CONNECTION_ERROR',
      instanceId,
      cause,
    );
  }

  /**
   * Create a validation error
   */
  static validation(message: string, field?: string): DuckLakeError {
    const error = new DuckLakeError(message, 'VALIDATION_ERROR');
    error.name = 'DuckLakeValidationError';
    if (field) {
      error.message = `${field}: ${message}`;
    }
    return error;
  }
}

// Export legacy class names for backward compatibility
export const UnsupportedCatalogError = DuckLakeError.unsupportedCatalog;
export const InstanceNotFoundError = DuckLakeError.instanceNotFound;
export const CatalogConnectionError = DuckLakeError.catalogConnection;
export const DuckLakeValidationError = DuckLakeError.validation;
