import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import {
  Box,
  Typography,
  Chip,
  Paper,
  useTheme,
  IconButton,
  Tooltip,
} from '@mui/material';
import { AddCircleOutline } from '@mui/icons-material';
import { LineageNode } from '../../../types/lineage';

export type DbtNodeData = LineageNode & {
  onExpand?: (nodeId: string, direction: 'upstream' | 'downstream') => void;
  isHighlighted?: boolean;
};

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
  let borderColor = 'transparent';
  if (selected) {
    borderColor = theme.palette.primary.main;
  } else if (data.isHighlighted) {
    borderColor = theme.palette.secondary.main;
  }

  return (
    <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      {/* Upstream Expand Button */}
      {data.upstreamCount > 0 && (
        <Tooltip title={`Expand ${data.upstreamCount} upstream`}>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              data.onExpand?.(data.uniqueId, 'upstream');
            }}
            sx={{
              position: 'absolute',
              left: -24,
              zIndex: 10,
              padding: 0,
              color: theme.palette.text.secondary,
              '&:hover': { color: theme.palette.primary.main },
            }}
          >
            <AddCircleOutline fontSize="small" />
          </IconButton>
        </Tooltip>
      )}

      <Paper
        elevation={selected ? 4 : 1}
        sx={{
          padding: '10px 12px',
          minWidth: 160,
          maxWidth: 240,
          borderRadius: 2,
          border: `2px solid ${borderColor}`,
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

      {/* Downstream Expand Button */}
      {data.downstreamCount > 0 && (
        <Tooltip title={`Expand ${data.downstreamCount} downstream`}>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              data.onExpand?.(data.uniqueId, 'downstream');
            }}
            sx={{
              position: 'absolute',
              right: -24,
              zIndex: 10,
              padding: 0,
              color: theme.palette.text.secondary,
              '&:hover': { color: theme.palette.primary.main },
            }}
          >
            <AddCircleOutline fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
});
