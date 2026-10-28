import type { ConnectionBase } from '../core/types.shared';
import {
  DEFAULT_SECRETS,
  type ConnectionDescriptor,
} from '../core/descriptor.shared';

export type SQLiteConnection = Omit<ConnectionBase, 'username' | 'password'> & {
  type: 'sqlite';
  database_path: string;
  short_database_path: string;
};

export const sqliteDescriptor: ConnectionDescriptor<
  'sqlite',
  SQLiteConnection
> = {
  type: 'sqlite',
  displayName: 'SQLite',
  capabilities: {
    dbt: false,
    nativeExport: false,
    icebergCatalog: false,
    listedByDefault: true,
    dbtV2: false,
  },
  secrets: DEFAULT_SECRETS,
  sql: {
    rules: { quote: 'double', folding: 'none', limit: 'limit' },
  },
};
