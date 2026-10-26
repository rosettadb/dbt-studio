import type { ConnectionBase, DBTConnectionBase } from '../core/types.shared';
import {
  DEFAULT_SECRETS,
  type ConnectionDescriptor,
} from '../core/descriptor.shared';

export type SnowflakeAuthMethod = 'password' | 'oauth_browser';

export type SnowflakeConnection = ConnectionBase & {
  type: 'snowflake';
  account: string;
  warehouse: string;
  role?: string;
  client_session_keep_alive?: boolean;
  authMethod?: SnowflakeAuthMethod;
};

export type SnowflakeDBTConnection = Omit<DBTConnectionBase, 'password'> & {
  type: 'snowflake';
  password?: string;
  account: string;
  warehouse: string;
  role?: string;
  client_session_keep_alive?: boolean;
  query_tag?: string;
  authMethod?: SnowflakeAuthMethod;
  authenticator?: 'oauth_authorization_code' | 'externalbrowser';
};

export const snowflakeDescriptor: ConnectionDescriptor<
  'snowflake',
  SnowflakeConnection
> = {
  type: 'snowflake',
  displayName: 'Snowflake',
  capabilities: {
    dbt: true,
    nativeExport: false,
    icebergCatalog: false,
    listedByDefault: true,
    dbtV2: true,
  },
  secrets: DEFAULT_SECRETS,
  sql: {
    rules: { quote: 'double', folding: 'upper', limit: 'limit' },
  },
  lineageDialect: 'snowflake',
};
