export type PipelinePluginId =
  | 'dbt@v1'
  | 'rosetta@v1'
  | 'terraform@v1'
  | 'command@v1'
  | 's3@v1'
  | 'kinetica_cli@v1';

export interface PipelinePluginField {
  key: string;
  label: string;
  required: boolean;
  multiline?: boolean;
  placeholder?: string;
  defaultValue?: string;
}

export interface PipelinePluginCatalogEntry {
  id: PipelinePluginId;
  label: string;
  category: string;
  fields: PipelinePluginField[];
}

export const PIPELINE_PLUGIN_CATALOG: PipelinePluginCatalogEntry[] = [
  {
    id: 'dbt@v1',
    label: 'dbt',
    category: 'Generic',
    fields: [
      {
        key: 'command',
        label: 'Command',
        required: true,
        multiline: true,
        defaultValue: 'dbt run',
        placeholder: 'dbt seed && dbt run',
      },
      {
        key: 'working_dir',
        label: 'Working Dir',
        required: false,
        placeholder: 'dbt',
      },
    ],
  },
  {
    id: 'rosetta@v1',
    label: 'rosetta',
    category: 'Generic',
    fields: [
      {
        key: 'command',
        label: 'Command',
        required: true,
        multiline: true,
        placeholder: 'rosetta apply -s bigquery',
      },
      {
        key: 'working_dir',
        label: 'Working Dir',
        required: false,
        placeholder: 'rosetta',
      },
    ],
  },
  {
    id: 'terraform@v1',
    label: 'terraform',
    category: 'Generic',
    fields: [
      {
        key: 'command',
        label: 'Command',
        required: true,
        multiline: true,
        placeholder: 'terraform init && terraform apply -auto-approve',
        defaultValue: 'terraform init && terraform apply -auto-approve',
      },
      {
        key: 'working_dir',
        label: 'Working Dir',
        required: false,
        placeholder: 'terraform',
      },
    ],
  },
  {
    id: 'command@v1',
    label: 'shell',
    category: 'Generic',
    fields: [
      {
        key: 'command',
        label: 'Command',
        required: true,
        multiline: true,
        placeholder: 'echo "hello world"',
      },
    ],
  },
  {
    id: 's3@v1',
    label: 's3',
    category: 'Generic',
    fields: [
      {
        key: 'command',
        label: 'Command',
        required: true,
        multiline: true,
        placeholder: 'aws s3 cp results/ s3://my-bucket/ --recursive',
      },
    ],
  },
  {
    id: 'kinetica_cli@v1',
    label: 'kinetica',
    category: 'Generic',
    fields: [
      {
        key: 'command',
        label: 'Command',
        required: true,
        multiline: true,
        placeholder: 'kisql --url http://localhost:9191 --sql "SELECT 1"',
      },
    ],
  },
];
