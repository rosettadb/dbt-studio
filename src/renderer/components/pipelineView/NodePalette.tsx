import React from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import { PLUGIN_DEFS, type PluginDef } from './pluginDefinitions';

const PluginChip: React.FC<{
  plugin: PluginDef;
  onAdd?: (pluginId: string) => void;
}> = ({ plugin, onAdd }) => {
  const Icon = plugin.icon;

  const onDragStart = (event: React.DragEvent) => {
    event.dataTransfer.setData('application/pipeline-plugin', plugin.id);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <Tooltip
      title="Drag to canvas or double-click to add"
      placement="right"
      arrow
    >
      <Box
        draggable
        onDragStart={onDragStart}
        onDoubleClick={() => onAdd?.(plugin.id)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          px: 0.75,
          py: 0.5,
          borderRadius: 1,
          cursor: 'grab',
          userSelect: 'none',
          border: `1px solid ${plugin.color}60`,
          bgcolor: `${plugin.color}10`,
          color: plugin.color,
          transition: 'background-color 0.15s',
          '&:hover': { bgcolor: `${plugin.color}28` },
          '&:active': { cursor: 'grabbing' },
        }}
      >
        <Icon sx={{ fontSize: 14, flexShrink: 0 }} />
        <Typography
          sx={{
            fontSize: '0.68rem',
            fontWeight: 700,
            lineHeight: 1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {plugin.label}
        </Typography>
      </Box>
    </Tooltip>
  );
};

export const NodePalette: React.FC<{ onAdd?: (pluginId: string) => void }> = ({
  onAdd,
}) => {
  const categories = React.useMemo(() => {
    const map = new Map<string, PluginDef[]>();
    PLUGIN_DEFS.forEach((plugin) => {
      const list = map.get(plugin.category) ?? [];
      list.push(plugin);
      map.set(plugin.category, list);
    });
    return Array.from(map.entries());
  }, []);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        px: 1,
        py: 1,
        borderRight: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        width: 130,
        flexShrink: 0,
        overflowY: 'auto',
      }}
    >
      {categories.map(([category, plugins]) => (
        <Box key={category} sx={{ mb: 1.5 }}>
          <Typography
            sx={{
              fontSize: '0.58rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
              color: 'text.disabled',
              px: 0.5,
              mb: 0.75,
            }}
          >
            {category}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {plugins.map((plugin) => (
              <PluginChip key={plugin.id} plugin={plugin} onAdd={onAdd} />
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
};
