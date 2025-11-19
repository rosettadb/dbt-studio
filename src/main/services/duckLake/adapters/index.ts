/**
 * DuckLake Catalog Adapters
 * Provides catalog-specific connection and operation implementations
 */

export { CatalogAdapter } from './base.adapter';
export { DuckDBCatalogAdapter } from './duckdb.adapter';
export { SQLiteCatalogAdapter } from './sqlite.adapter';
export { PostgreSQLCatalogAdapter } from './postgresql.adapter';
export { CatalogAdapterFactory } from './factory';
