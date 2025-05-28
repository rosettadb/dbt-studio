import { BigQuery } from '@google-cloud/bigquery';
import { Column, Table } from '../../types/backend';

// BigQuery type mapping for better type compatibility
const BQ_TYPE_MAP: Record<string, string> = {
  'STRING': 'STRING',
  'BYTES': 'BYTES',
  'INTEGER': 'INT64',
  'INT64': 'INT64',
  'FLOAT': 'FLOAT64',
  'FLOAT64': 'FLOAT64',
  'NUMERIC': 'NUMERIC',
  'BIGNUMERIC': 'BIGNUMERIC',
  'BOOLEAN': 'BOOL',
  'BOOL': 'BOOL',
  'TIMESTAMP': 'TIMESTAMP',
  'DATE': 'DATE',
  'TIME': 'TIME',
  'DATETIME': 'DATETIME',
  'RECORD': 'STRUCT',
  'STRUCT': 'STRUCT'
};

export default class BigQueryExtractor {
  private client: BigQuery;

  constructor(config: {
    projectId: string;
    keyFilename?: string;
    credentials?: {
      client_email: string;
      private_key: string;
    };
    location?: string;
  }) {
    this.client = new BigQuery(config);
  }

  async connect(): Promise<void> {
    // Test connection by making a simple query
    try {
      await this.client.query('SELECT 1');
      return Promise.resolve();
    } catch (err) {
      return Promise.reject(err);
    }
  }

  async disconnect(): Promise<void> {
    // BigQuery client doesn't require explicit disconnection
    return Promise.resolve();
  }

  private async getDatasets(): Promise<string[]> {
    const [datasets] = await this.client.getDatasets();
    return datasets.map(dataset => dataset.id as string);
  }

  private async getTablesForDataset(datasetId: string): Promise<{ name: string, type: 'TABLE' | 'VIEW' }[]> {
    const dataset = this.client.dataset(datasetId);
    const [tables] = await dataset.getTables();

    return tables.map(table => ({
      name: table.id as string,
      type: table.metadata.type === 'VIEW' ? 'VIEW' : 'TABLE'
    }));
  }

  private async getTableSchema(datasetId: string, tableId: string): Promise<Column[]> {
    const [metadata] = await this.client.dataset(datasetId).table(tableId).getMetadata();
    const schema = metadata.schema?.fields || [];

    return schema.map((field: any, index: number) => ({
      name: field.name,
      typeName: BQ_TYPE_MAP[field.type] || field.type,
      ordinalPosition: index + 1,
      primaryKeySequenceId: 0, // BigQuery doesn't have traditional primary keys
      columnDisplaySize: 0,
      scale: 0,
      precision: field.precision || 0,
      columnProperties: [
        ...field.mode ? [{ key: 'mode', value: field.mode }] : [],
        ...field.description ? [{ key: 'description', value: field.description }] : []
      ],
      autoincrement: false,
      primaryKey: false,
      nullable: field.mode === 'NULLABLE' || field.mode === 'REPEATED',
    }));
  }

  async extractSchema(): Promise<{ tables: Table[] }> {
    const datasets = await this.getDatasets();
    const allTables: Table[] = [];

    for (const dataset of datasets) {
      const tables = await this.getTablesForDataset(dataset);

      for (const table of tables) {
        try {
          const columns = await this.getTableSchema(dataset, table.name);

          allTables.push({
            name: table.name,
            type: table.type,
            schema: dataset,
            columns,
          });
        } catch (err) {
          console.error(`Error getting schema for ${dataset}.${table.name}:`, err);
          // Continue with other tables even if one fails
          continue;
        }
      }
    }

    return { tables: allTables };
  }
}