import type { ConnectionBase, DBTConnectionBase } from '../core/types.shared';
import {
  DEFAULT_SECRETS,
  type ConnectionDescriptor,
} from '../core/descriptor.shared';

export type KineticaConnection = ConnectionBase & {
  type: 'kinetica';
  host: string;
  port: number;
  timeout?: number;
  useSSL?: boolean;
  bypassSslCertCheck?: boolean;
};

export type KineticaDBTConnection = DBTConnectionBase & {
  type: 'kinetica';
  host: string;
  port: number;
  timeout?: number;
  useSSL?: boolean;
  bypassSslCertCheck?: boolean;
};

export const kineticaDescriptor: ConnectionDescriptor<
  'kinetica',
  KineticaConnection
> = {
  type: 'kinetica',
  displayName: 'Kinetica',
  capabilities: {
    dbt: true,
    nativeExport: false,
    icebergCatalog: false,
    listedByDefault: true,
    dbtV2: false,
  },
  secrets: DEFAULT_SECRETS,
  sql: {
    rules: { quote: 'double', folding: 'none', limit: 'limit' },
  },
  lineageDialect: 'postgres',
};
