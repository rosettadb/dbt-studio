export type PluginId =
  | 'dbt@v1'
  | 'rosetta@v1'
  | 'terraform@v1'
  | 'command@v1'
  | 's3@v1'
  | 'kinetica_cli@v1'
  | 'git_clone@v1';

export interface PluginField {
  key: string;
  label: string;
  required: boolean;
  multiline?: boolean;
  placeholder?: string;
  defaultValue?: string;
}

export interface PluginDef {
  id: PluginId;
  label: string;
  color: string;
  fields: PluginField[];
}

export const PLUGIN_DEFS: PluginDef[] = [
  {
    id: 'dbt@v1',
    label: 'dbt',
    color: '#FF694B',
    fields: [
      {
        key: 'command',
        label: 'Command',
        required: true,
        multiline: true,
        defaultValue: 'dbt run',
        placeholder: 'dbt seed && dbt run',
      },
      { key: 'working_dir', label: 'Working Dir', required: false, placeholder: 'dbt' },
    ],
  },
  {
    id: 'rosetta@v1',
    label: 'rosetta',
    color: '#7C4DFF',
    fields: [
      {
        key: 'command',
        label: 'Command',
        required: true,
        multiline: true,
        placeholder: 'rosetta apply -s bigquery',
      },
      { key: 'working_dir', label: 'Working Dir', required: false, placeholder: 'rosetta' },
    ],
  },
  {
    id: 'terraform@v1',
    label: 'terraform',
    color: '#7B42BC',
    fields: [
      {
        key: 'command',
        label: 'Command',
        required: true,
        multiline: true,
        placeholder: 'terraform init && terraform apply -auto-approve',
        defaultValue: 'terraform init && terraform apply -auto-approve',
      },
      { key: 'working_dir', label: 'Working Dir', required: false, placeholder: 'terraform' },
    ],
  },
  {
    id: 'command@v1',
    label: 'shell',
    color: '#455A64',
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
    color: '#FF9900',
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
    color: '#00BCD4',
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
    color: '#F05133',
    fields: [
      {
        key: 'url',
        label: 'Repository URL',
        required: true,
        placeholder: 'https://github.com/org/repo.git',
      },
      { key: 'branch', label: 'Branch', required: false, placeholder: 'main' },
      { key: 'dest', label: 'Destination Dir', required: false, placeholder: '.' },
    ],
  },
];

export const PLUGIN_MAP = new Map<string, PluginDef>(
  PLUGIN_DEFS.map((p) => [p.id, p]),
);
