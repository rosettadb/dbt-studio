import type { ConnectionBase } from '../core/types.shared';
import type { ConnectionDescriptor } from '../core/descriptor.shared';

export type SpannerAuthMethod = 'service-account' | 'adc' | 'emulator';

export type SpannerConnection = ConnectionBase & {
  type: 'spanner';
  project: string;
  instance: string;
  /** Spanner database ID. */
  database: string;
  /** '' = the GoogleSQL default schema; 'public' in the PostgreSQL dialect. */
  schema: string;
  authMethod: SpannerAuthMethod;
  /** Stored: the keytar key name `db-spanner-<name>`. Test and save requests: the raw key JSON. */
  keyfile?: string;
  /** host:port, emulator auth only. */
  emulatorHost?: string;
  // ConnectionBase: username = project, password = ''
};

export const spannerDescriptor: ConnectionDescriptor<
  'spanner',
  SpannerConnection
> = {
  type: 'spanner',
  displayName: 'Spanner',
  capabilities: {
    dbt: false,
    nativeExport: false,
    icebergCatalog: false,
    listedByDefault: true,
    dbtV2: false,
  },
  // Not DEFAULT_SECRETS: its keyfile entry points at BigQuery's key.
  secrets: [{ field: 'keyfile', key: 'spanner', exportable: false }],
  storedKeys: ['spanner'],
  sql: {
    rules: { quote: 'backtick', folding: 'none', limit: 'limit' },
  },
};
