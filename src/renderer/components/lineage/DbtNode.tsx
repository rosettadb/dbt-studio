import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Box, Typography, Chip, Paper, useTheme } from '@mui/material';
import { LineageNode } from '../../../types/lineage';

export type DbtNodeData = LineageNode;

export const DbtNode = memo(({ data, selected }: NodeProps<DbtNodeData>) => {
  const theme = useTheme();

  const getResourceTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'model':
        return theme.palette.primary.main;
      case 'source':
        return theme.palette.success.main;
      case 'seed':
        return theme.palette.info.main;
      case 'snapshot':
        return theme.palette.warning.main;
      case 'test':
        return theme.palette.error.main;
      default:
        return theme.palette.text.secondary;
    }
  };

  const typeColor = getResourceTypeColor(data.resourceType);

  return (
    <Paper
      elevation={selected ? 4 : 1}
      sx={{
        padding: '10px 12px',
        minWidth: 160,
        maxWidth: 240,
        borderRadius: 2,
        border: `2px solid ${selected ? theme.palette.primary.main : 'transparent'}`,
        backgroundColor: theme.palette.background.paper,
        transition: 'all 0.2s',
        '&:hover': {
          boxShadow: theme.shadows[4],
        },
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: theme.palette.divider, width: 8, height: 8 }}
      />

      <Box sx={{ mb: 1 }}>
        <Typography
          variant="subtitle2"
          noWrap
          title={data.label}
          sx={{ fontWeight: 600 }}
        >
          {data.label}
        </Typography>
      </Box>

      <Box display="flex" alignItems="center" gap={1}>
        <Chip
          label={data.resourceType}
          size="small"
          sx={{
            height: 20,
            fontSize: '0.65rem',
            fontWeight: 600,
            color: theme.palette.getContrastText(typeColor),
            backgroundColor: typeColor,
          }}
        />
      </Box>

      <Handle
        type="source"
        position={Position.Right}
        style={{ background: theme.palette.divider, width: 8, height: 8 }}
      />
    </Paper>
  );
});
