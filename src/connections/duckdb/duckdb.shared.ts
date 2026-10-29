import type { ConnectionBase, DBTConnectionBase } from '../core/types.shared';
import {
  DEFAULT_SECRETS,
  type ConnectionDescriptor,
} from '../core/descriptor.shared';

export type DuckDBConnection = Omit<ConnectionBase, 'username' | 'password'> & {
  type: 'duckdb';
  database_path: string; // Path to .duckdb file
  short_database_path: string;
  // No username/password needed for DuckDB
};

export type DuckDBDBTConnection = Omit<
  DBTConnectionBase,
  'username' | 'password'
> & {
  type: 'duckdb';
  path: string; // Database file path
};

export const duckdbDescriptor: ConnectionDescriptor<
  'duckdb',
  DuckDBConnection
> = {
  type: 'duckdb',
  displayName: 'DuckDB',
  capabilities: {
    dbt: true,
    nativeExport: true,
    icebergCatalog: false,
    listedByDefault: true,
    dbtV2: true,
  },
  secrets: DEFAULT_SECRETS,
  sql: {
    rules: { quote: 'double', folding: 'none', limit: 'limit' },
  },
};
