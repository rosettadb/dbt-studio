import type { ConnectionBase, DBTConnectionBase } from '../core/types.shared';
import {
  DEFAULT_SECRETS,
  type ConnectionDescriptor,
} from '../core/descriptor.shared';

export type MySqlConnection = ConnectionBase & {
  type: 'mysql';
  host: string;
  port: number;
  ssl?: boolean;
};

export type MySqlDBTConnection = DBTConnectionBase & {
  type: 'mysql';
  host: string;
  port: number;
  ssl?: boolean;
  sslRejectUnauthorized?: boolean;
};

export const mysqlDescriptor: ConnectionDescriptor<'mysql', MySqlConnection> = {
  type: 'mysql',
  displayName: 'MySQL',
  capabilities: {
    dbt: false,
    nativeExport: false,
    icebergCatalog: false,
    listedByDefault: true,
    dbtV2: false,
  },
  secrets: DEFAULT_SECRETS,
  sql: {
    rules: { quote: 'backtick', folding: 'none', limit: 'limit' },
    renameTable: (from, to) => `RENAME TABLE ${from} TO ${to};`,
  },
};
