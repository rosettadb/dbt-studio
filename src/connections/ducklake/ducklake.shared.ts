import type { ConnectionBase } from '../core/types.shared';
import {
  DEFAULT_SECRETS,
  type ConnectionDescriptor,
} from '../core/descriptor.shared';

export type DuckLakeConnectionConfig = Omit<
  ConnectionBase,
  'username' | 'password' | 'database' | 'schema'
> & {
  type: 'ducklake';
  instanceId: string;
  // Metadata from instance
  catalogType?: 'duckdb' | 'postgresql' | 'sqlite';
  dataPath?: string;
  status?: 'active' | 'inactive' | 'error' | 'connecting';
};

export const ducklakeDescriptor: ConnectionDescriptor<
  'ducklake',
  DuckLakeConnectionConfig
> = {
  type: 'ducklake',
  displayName: 'DuckLake',
  capabilities: {
    dbt: true,
    nativeExport: true,
    icebergCatalog: false,
    listedByDefault: false,
    dbtV2: false,
  },
  secrets: DEFAULT_SECRETS,
  sql: {
    rules: { quote: 'double', folding: 'none', limit: 'limit' },
  },
  dbtAdapterLabel: 'DuckLake',
};

export const isDuckLakeType = (type?: string | null): boolean =>
  type === 'ducklake';

export const isDuckLakeConnection = <C extends { type?: string }>(
  conn: C | null | undefined,
): conn is C & { type: 'ducklake' } => isDuckLakeType(conn?.type);
