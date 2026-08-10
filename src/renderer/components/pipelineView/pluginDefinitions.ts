import type { SvgIconComponent } from '@mui/icons-material';
import TransformIcon from '@mui/icons-material/Transform';
import LanguageIcon from '@mui/icons-material/Language';
import BuildIcon from '@mui/icons-material/Build';
import TerminalIcon from '@mui/icons-material/Terminal';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import SpeedIcon from '@mui/icons-material/Speed';
import {
  ADDABLE_PIPELINE_PLUGINS,
  PipelinePluginField,
  PipelinePluginId,
} from '../../../shared/pipelinePluginCatalog';

export type PluginId = PipelinePluginId;
export type PluginField = PipelinePluginField;

export interface PluginDef {
  id: PluginId;
  label: string;
  color: string;
  category: string;
  icon: SvgIconComponent;
  fields: PluginField[];
}

const VISUAL_PLUGIN_METADATA: Record<
  Exclude<PluginId, 'git_clone@v1'>,
  { color: string; icon: SvgIconComponent }
> = {
  'dbt@v1': { color: '#FF694B', icon: TransformIcon },
  'rosetta@v1': { color: '#7C4DFF', icon: LanguageIcon },
  'terraform@v1': { color: '#7B42BC', icon: BuildIcon },
  'command@v1': { color: '#455A64', icon: TerminalIcon },
  's3@v1': { color: '#FF9900', icon: CloudUploadIcon },
  'kinetica_cli@v1': { color: '#00BCD4', icon: SpeedIcon },
};

export const PLUGIN_DEFS: PluginDef[] = ADDABLE_PIPELINE_PLUGINS.map(
  (plugin) => ({
    ...plugin,
    fields: [...plugin.fields],
    category: 'Generic',
    ...VISUAL_PLUGIN_METADATA[plugin.id as Exclude<PluginId, 'git_clone@v1'>],
  }),
);

export const PLUGIN_MAP = new Map<string, PluginDef>(
  PLUGIN_DEFS.map((p) => [p.id, p]),
);
