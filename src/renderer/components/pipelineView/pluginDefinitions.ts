import type { SvgIconComponent } from '@mui/icons-material';
import TransformIcon from '@mui/icons-material/Transform';
import LanguageIcon from '@mui/icons-material/Language';
import BuildIcon from '@mui/icons-material/Build';
import TerminalIcon from '@mui/icons-material/Terminal';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import SpeedIcon from '@mui/icons-material/Speed';
import {
  PIPELINE_PLUGIN_CATALOG,
  PipelinePluginCatalogEntry,
  PipelinePluginField,
  PipelinePluginId,
} from '../../../shared/pipelines/pluginCatalog';

export type PluginId = PipelinePluginId | 'git_clone@v1';
export type PluginField = PipelinePluginField;

export interface PluginDef extends Omit<PipelinePluginCatalogEntry, 'id'> {
  id: PipelinePluginId;
  color: string;
  icon: SvgIconComponent;
}

const PLUGIN_PRESENTATION: Record<
  PipelinePluginId,
  { color: string; icon: SvgIconComponent }
> = {
  'dbt@v1': { color: '#FF694B', icon: TransformIcon },
  'rosetta@v1': { color: '#7C4DFF', icon: LanguageIcon },
  'terraform@v1': { color: '#7B42BC', icon: BuildIcon },
  'command@v1': { color: '#455A64', icon: TerminalIcon },
  's3@v1': { color: '#FF9900', icon: CloudUploadIcon },
  'kinetica_cli@v1': { color: '#00BCD4', icon: SpeedIcon },
};

export const PLUGIN_DEFS: PluginDef[] = PIPELINE_PLUGIN_CATALOG.map(
  (plugin) => ({
    ...plugin,
    ...PLUGIN_PRESENTATION[plugin.id],
  }),
);

export const PLUGIN_MAP = new Map<string, PluginDef>(
  PLUGIN_DEFS.map((p) => [p.id, p]),
);
