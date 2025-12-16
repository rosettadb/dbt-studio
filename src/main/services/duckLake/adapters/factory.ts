/**
 * Catalog Adapter Factory
 * Creates appropriate adapter instances based on catalog type
 */

import { DuckLakeCatalogType } from '../../../../types/duckLake';
import { DuckLakeError } from '../../../../types/duckLakeErrors';
import { CatalogAdapter } from './base.adapter';
import { DuckDBCatalogAdapter } from './duckdb.adapter';
import { SQLiteCatalogAdapter } from './sqlite.adapter';
import { PostgreSQLCatalogAdapter } from './postgresql.adapter';

export class CatalogAdapterFactory {
  private static adapters: Map<string, CatalogAdapter> = new Map();

  /**
   * Create or get cached adapter for catalog type
   */
  static getAdapter(catalogType: DuckLakeCatalogType): CatalogAdapter {
    // Check if we have a cached adapter
    const cached = this.adapters.get(catalogType);
    if (cached) {
      return cached;
    }

    // Create new adapter
    let adapter: CatalogAdapter;

    switch (catalogType) {
      case 'duckdb':
        adapter = new DuckDBCatalogAdapter();
        break;
      case 'sqlite':
        adapter = new SQLiteCatalogAdapter();
        break;
      case 'postgresql':
        adapter = new PostgreSQLCatalogAdapter();
        break;
      default:
        throw DuckLakeError.unsupportedCatalog(catalogType);
    }

    // Cache the adapter
    this.adapters.set(catalogType, adapter);
    return adapter;
  }

  /**
   * Create a new adapter instance (not cached)
   */
  static createAdapter(catalogType: DuckLakeCatalogType): CatalogAdapter {
    switch (catalogType) {
      case 'duckdb':
        return new DuckDBCatalogAdapter();
      case 'sqlite':
        return new SQLiteCatalogAdapter();
      case 'postgresql':
        return new PostgreSQLCatalogAdapter();
      default:
        throw DuckLakeError.unsupportedCatalog(catalogType);
    }
  }

  /**
   * Clear cached adapters (useful for testing or cleanup)
   */
  static clearCache(): void {
    this.adapters.clear();
  }

  /**
   * Disconnect and clear all cached adapters
   */
  static async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.adapters.values()).map(
      (adapter) =>
        adapter.disconnect().catch((error) => {
          // eslint-disable-next-line no-console
          console.error('Error disconnecting adapter:', error);
        }),
    );

    await Promise.all(disconnectPromises);
    this.clearCache();
  }

  /**
   * Get all supported catalog types
   */
  static getSupportedTypes(): DuckLakeCatalogType[] {
    return ['duckdb', 'sqlite', 'postgresql'];
  }

  /**
   * Check if catalog type is supported
   */
  static isSupported(catalogType: string): catalogType is DuckLakeCatalogType {
    return this.getSupportedTypes().includes(
      catalogType as DuckLakeCatalogType,
    );
  }
}
