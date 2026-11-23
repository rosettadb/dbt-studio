import React from 'react';
import type { SvgIconComponent } from '@mui/icons-material';
import TransformIcon from '@mui/icons-material/Transform';
import LanguageIcon from '@mui/icons-material/Language';
import BuildIcon from '@mui/icons-material/Build';
import TerminalIcon from '@mui/icons-material/Terminal';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CloudIcon from '@mui/icons-material/Cloud';
import SpeedIcon from '@mui/icons-material/Speed';
import CodeIcon from '@mui/icons-material/Code';
import LinkIcon from '@mui/icons-material/Link';
import StorageIcon from '@mui/icons-material/Storage';
import ScheduleIcon from '@mui/icons-material/Schedule';
import ExtensionIcon from '@mui/icons-material/Extension';
import { useGetRunnerPlugins } from './pipelineControllers';
import type { PluginDefinition } from '../../../extensionApi/studio/pipelineShared';

// Which plugins exist and what their forms look like comes from the runner's
// plugin manifest (useGetRunnerPlugins). This file only draws them.

// Icons a manifest entry can name (`icon`, a Material icon name). Any other
// name gets the generic plugin icon.
const ICONS: Record<string, SvgIconComponent> = {
  transform: TransformIcon,
  language: LanguageIcon,
  build: BuildIcon,
  terminal: TerminalIcon,
  cloud_upload: CloudUploadIcon,
  cloud: CloudIcon,
  speed: SpeedIcon,
  code: CodeIcon,
  link: LinkIcon,
  storage: StorageIcon,
  schedule: ScheduleIcon,
  extension: ExtensionIcon,
};

export interface PluginVisual {
  label: string;
  /** Undefined: the caller uses its own default (the theme's colour). */
  color?: string;
  icon: SvgIconComponent;
}

/** How a step's plugin is drawn; `plugin` is undefined for an unknown one. */
export function getPluginVisual(
  plugin: PluginDefinition | undefined,
  pluginId: string,
): PluginVisual {
  if (!plugin) {
    return { label: pluginId.split('@')[0], icon: TerminalIcon };
  }
  return {
    label: plugin.label,
    color: plugin.color,
    icon: (plugin.icon && ICONS[plugin.icon]) || ExtensionIcon,
  };
}

const NO_PLUGINS: PluginDefinition[] = [];

export interface PluginCatalog {
  plugins: PluginDefinition[];
  byId: ReadonlyMap<string, PluginDefinition>;
  isLoading: boolean;
}

export function usePluginCatalog(): PluginCatalog {
  const { data, isLoading } = useGetRunnerPlugins();
  const plugins = data ?? NO_PLUGINS;
  return React.useMemo(
    () => ({
      plugins,
      byId: new Map(plugins.map((plugin) => [plugin.id, plugin])),
      isLoading,
    }),
    [plugins, isLoading],
  );
}
