import type { ConnectionBase } from '../core/types.shared';
import {
  DEFAULT_SECRETS,
  type ConnectionDescriptor,
} from '../core/descriptor.shared';

export type OracleConnectMode = 'basic' | 'connectString' | 'wallet';

export type OracleConnection = ConnectionBase & {
  type: 'oracle';
  connectMode: OracleConnectMode;
  host?: string;
  port?: number;
  serviceName?: string;
  tls?: boolean;
  connectString?: string;
  walletDir?: string;
  /** Transient: sent only with connector:test, never persisted. */
  walletPassword?: string;
};

export const oracleDescriptor: ConnectionDescriptor<
  'oracle',
  OracleConnection
> = {
  type: 'oracle',
  displayName: 'Oracle',
  capabilities: {
    dbt: false,
    nativeExport: false,
    icebergCatalog: false,
    listedByDefault: true,
    dbtV2: false,
  },
  secrets: [
    ...DEFAULT_SECRETS,
    { field: 'walletPassword', key: 'walletpassword', exportable: false },
  ],
  sql: {
    rules: { quote: 'double', folding: 'upper', limit: 'fetch' },
  },
  lineageDialect: 'oracle',
};
