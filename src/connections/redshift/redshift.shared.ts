import type { ConnectionBase, DBTConnectionBase } from '../core/types.shared';
import {
  DEFAULT_SECRETS,
  type ConnectionDescriptor,
} from '../core/descriptor.shared';

export type RedshiftConnection = ConnectionBase & {
  type: 'redshift';
  host: string;
  port: number;
  keepalives_idle?: number;
  ssl?: boolean;
  sslrootcert?: string;
};

export type RedshiftDBTConnection = DBTConnectionBase & {
  type: 'redshift';
  host: string;
  port: number;
  keepalives_idle?: number;
  ssl?: boolean;
  sslrootcert?: string;
};

export const redshiftDescriptor: ConnectionDescriptor<
  'redshift',
  RedshiftConnection
> = {
  type: 'redshift',
  displayName: 'Redshift',
  capabilities: {
    dbt: true,
    nativeExport: false,
    icebergCatalog: false,
    listedByDefault: true,
    dbtV2: true,
  },
  secrets: DEFAULT_SECRETS,
  sql: {
    rules: { quote: 'double', folding: 'lower', limit: 'limit' },
  },
  lineageDialect: 'redshift',
};
