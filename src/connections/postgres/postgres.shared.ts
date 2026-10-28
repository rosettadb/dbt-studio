import type { ConnectionBase, DBTConnectionBase } from '../core/types.shared';
import {
  DEFAULT_SECRETS,
  type ConnectionDescriptor,
} from '../core/descriptor.shared';

export type PostgresConnection = ConnectionBase & {
  type: 'postgres';
  host: string;
  port: number;
  keepalives_idle?: number;
  ssl?: boolean;
  sslRejectUnauthorized?: boolean;
};

export type PostgresDBTConnection = DBTConnectionBase & {
  type: 'postgres';
  host: string;
  port: number;
  keepalives_idle?: number;
  ssl?: boolean;
};

export const postgresDescriptor: ConnectionDescriptor<
  'postgres',
  PostgresConnection
> = {
  type: 'postgres',
  displayName: 'PostgreSQL',
  aliases: ['postgresql'],
  capabilities: {
    dbt: true,
    nativeExport: false,
    icebergCatalog: true,
    listedByDefault: true,
    dbtV2: false,
  },
  secrets: DEFAULT_SECRETS,
  sql: {
    rules: { quote: 'double', folding: 'lower', limit: 'limit' },
  },
  lineageDialect: 'postgres',
  dbtAdapterLabel: 'Postgres',
};
