import React from 'react';
import { Box, Chip, Typography } from '@mui/material';
import { PLUGIN_DEFS } from './pluginDefinitions';

export const NodePalette: React.FC<{ onAdd?: (pluginId: string) => void }> = ({ onAdd }) => {
  const onDragStart = (event: React.DragEvent, pluginId: string) => {
    event.dataTransfer.setData('application/pipeline-plugin', pluginId);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        px: 2,
        py: 0.75,
        borderBottom: 1,
        borderColor: 'divider',
        flexWrap: 'wrap',
        bgcolor: 'background.paper',
      }}
    >
      <Typography
        variant="caption"
        sx={{ color: 'text.disabled', mr: 0.5, whiteSpace: 'nowrap', fontSize: '0.65rem' }}
      >
        Drag to canvas:
      </Typography>
      {PLUGIN_DEFS.map((plugin) => (
        <Chip
          key={plugin.id}
          label={plugin.label}
          size="small"
          draggable
          onDragStart={(e) => onDragStart(e, plugin.id)}
          onDoubleClick={() => onAdd?.(plugin.id)}
          sx={{
            cursor: 'grab',
            height: 22,
            fontSize: '0.68rem',
            fontWeight: 700,
            color: plugin.color,
            borderColor: `${plugin.color}80`,
            bgcolor: `${plugin.color}12`,
            userSelect: 'none',
            '&:hover': { bgcolor: `${plugin.color}28` },
            '&:active': { cursor: 'grabbing' },
            '& .MuiChip-label': { px: 0.75 },
          }}
          variant="outlined"
        />
      ))}
    </Box>
  );
};
