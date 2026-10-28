import type { ConnectionBase, DBTConnectionBase } from '../core/types.shared';
import {
  DEFAULT_SECRETS,
  type ConnectionDescriptor,
} from '../core/descriptor.shared';

export type DatabricksConnection = Omit<
  ConnectionBase,
  'username' | 'password'
> & {
  type: 'databricks';
  host: string;
  port: number;
  httpPath: string;
  token: string; // Replace password with token
  keepalives_idle?: number;
};

export type DatabricksDBTConnection = Omit<
  DBTConnectionBase,
  'username' | 'password'
> & {
  type: 'databricks';
  host: string;
  port: number;
  http_path: string;
  schema: string;
  catalog?: string;
  token: string;
  keepalives_idle?: number;
  query_tag?: string;
};

export const databricksDescriptor: ConnectionDescriptor<
  'databricks',
  DatabricksConnection
> = {
  type: 'databricks',
  displayName: 'Databricks',
  capabilities: {
    dbt: true,
    nativeExport: false,
    icebergCatalog: false,
    listedByDefault: true,
    dbtV2: true,
  },
  secrets: DEFAULT_SECRETS,
  sql: {
    rules: { quote: 'backtick', folding: 'none', limit: 'limit' },
  },
  lineageDialect: 'databricks',
};
