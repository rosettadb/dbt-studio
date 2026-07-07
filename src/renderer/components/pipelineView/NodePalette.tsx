import React from 'react';
import { Box, Tooltip, Typography, useTheme } from '@mui/material';
import { PLUGIN_DEFS, type PluginDef } from './pluginDefinitions';

const PluginRow: React.FC<{
  plugin: PluginDef;
  onAdd?: (pluginId: string) => void;
}> = ({ plugin, onAdd }) => {
  const theme = useTheme();
  const Icon = plugin.icon;

  const onDragStart = (event: React.DragEvent) => {
    event.dataTransfer.setData('application/pipeline-plugin', plugin.id);
    event.dataTransfer.setData('text/plain', plugin.id);
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
          gap: 1,
          px: 1,
          py: 0.75,
          borderRadius: 1,
          cursor: 'grab',
          userSelect: 'none',
          color: 'text.primary',
          transition: 'background-color 0.15s',
          '&:hover': { bgcolor: 'action.hover' },
          '&:active': { cursor: 'grabbing', bgcolor: 'action.selected' },
        }}
      >
        <Icon sx={{ fontSize: 15, flexShrink: 0, color: plugin.color }} />
        <Typography
          variant="body2"
          sx={{
            fontSize: '0.75rem',
            lineHeight: 1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: theme.palette.text.primary,
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
      onDragOver={(e: React.DragEvent) => e.preventDefault()}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        px: 0.5,
        py: 1,
        borderRight: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        width: 140,
        flexShrink: 0,
        overflowY: 'auto',
      }}
    >
      <Typography
        sx={{
          fontSize: '0.6rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
          color: 'text.disabled',
          px: 1,
          mb: 0.5,
        }}
      >
        Steps
      </Typography>
      {categories.map(([category, plugins]) => (
        <Box key={category}>
          {categories.length > 1 && (
            <Typography
              sx={{
                fontSize: '0.58rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: 0.6,
                color: 'text.disabled',
                px: 1,
                mt: 1,
                mb: 0.25,
              }}
            >
              {category}
            </Typography>
          )}
          {plugins.map((plugin) => (
            <PluginRow key={plugin.id} plugin={plugin} onAdd={onAdd} />
          ))}
        </Box>
      ))}
    </Box>
  );
};
