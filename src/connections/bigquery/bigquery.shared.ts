import type { ConnectionBase, DBTConnectionBase } from '../core/types.shared';
import {
  DEFAULT_SECRETS,
  type ConnectionDescriptor,
} from '../core/descriptor.shared';

export type BigQueryConnection = ConnectionBase & {
  type: 'bigquery';
  project: string;
  dataset: string;
  method: 'service-account';
  keyfile: string;
  location?: string;
  priority?: 'interactive' | 'batch';
  // Base properties that will be ignored for BigQuery but required by interface
  host?: string;
  port?: number;
  database: string; // Will be set to project ID
  schema: string; // Will be set to dataset
  username: string; // Will be set to project ID
  password: string; // Will be empty for BigQuery
};

export type BigQueryDBTConnection = DBTConnectionBase & {
  type: 'bigquery';
  method: 'service-account';
  project: string;
  keyfile?: string;
  location?: string;
  priority?: 'interactive' | 'batch';
};

export const bigqueryDescriptor: ConnectionDescriptor<
  'bigquery',
  BigQueryConnection
> = {
  type: 'bigquery',
  displayName: 'BigQuery',
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
  lineageDialect: 'bigquery',
};
