export type PipelinePluginId =
  | 'dbt@v1'
  | 'rosetta@v1'
  | 'terraform@v1'
  | 'command@v1'
  | 's3@v1'
  | 'kinetica_cli@v1'
  | 'git_clone@v1';

export interface PipelinePluginField {
  key: 'command' | 'working_dir' | 'url' | 'branch' | 'dest';
  label: string;
  required: boolean;
  multiline?: boolean;
  placeholder?: string;
  defaultValue?: string;
}

export interface PipelinePluginContract {
  id: PipelinePluginId;
  label: string;
  availability: 'addable' | 'preserve-only';
  fields: readonly PipelinePluginField[];
}

export const PIPELINE_PLUGIN_CATALOG: readonly PipelinePluginContract[] = [
  {
    id: 'dbt@v1',
    label: 'dbt',
    availability: 'addable',
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
    availability: 'addable',
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
    availability: 'addable',
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
    availability: 'addable',
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
    availability: 'addable',
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
    availability: 'addable',
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
  {
    id: 'git_clone@v1',
    label: 'git clone',
    availability: 'preserve-only',
    fields: [
      { key: 'url', label: 'URL', required: true },
      { key: 'branch', label: 'Branch', required: false },
      { key: 'dest', label: 'Destination', required: false },
    ],
  },
] as const;

export const ADDABLE_PIPELINE_PLUGINS = PIPELINE_PLUGIN_CATALOG.filter(
  (plugin) => plugin.availability === 'addable',
);

export const PIPELINE_PLUGIN_BY_ID: ReadonlyMap<
  string,
  PipelinePluginContract
> = new Map(PIPELINE_PLUGIN_CATALOG.map((plugin) => [plugin.id, plugin]));
