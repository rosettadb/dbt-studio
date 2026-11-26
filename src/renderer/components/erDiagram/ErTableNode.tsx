import React, { memo } from 'react';
import { Handle, NodeProps, Position } from 'reactflow';
import { Box, Paper, Tooltip, Typography, useTheme } from '@mui/material';
import {
  Key,
  Link as LinkIcon,
  TableChart,
  Visibility,
} from '@mui/icons-material';
import type { ErTable } from './buildErGraph';

export const ER_NODE_WIDTH = 260;
export const ER_HEADER_HEIGHT = 36;
export const ER_ROW_HEIGHT = 24;

/** Handle ids for a column row: lines leave on the right, arrive on the left. */
export const erSourceHandleId = (column: string) => `${column}::source`;
export const erTargetHandleId = (column: string) => `${column}::target`;

const hiddenHandleStyle: React.CSSProperties = {
  opacity: 0,
  width: 6,
  height: 6,
  minWidth: 0,
  minHeight: 0,
  border: 'none',
};

/** `isFocus` marks the table whose page the diagram is on. */
export type ErTableNodeData = ErTable & { isFocus?: boolean };

export const ErTableNode = memo(({ data }: NodeProps<ErTableNodeData>) => {
  const theme = useTheme();
  // Room for two icons only in tables where a column is both a key and a
  // link, so other tables keep their column names where they were.
  const iconSpaceWidth = data.columns.some(
    (column) => column.isPrimaryKey && column.isForeignKey,
  )
    ? 30
    : 14;

  return (
    <Paper
      variant="outlined"
      sx={{
        width: ER_NODE_WIDTH,
        borderRadius: 1.5,
        borderColor: data.isFocus ? 'primary.main' : undefined,
        borderWidth: data.isFocus ? 2 : undefined,
        overflow: 'hidden',
        backgroundColor: theme.palette.background.paper,
      }}
    >
      <Box
        sx={{
          height: ER_HEADER_HEIGHT,
          px: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          backgroundColor: theme.palette.action.hover,
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}
      >
        {data.isView ? (
          <Visibility sx={{ fontSize: 16, color: 'text.secondary' }} />
        ) : (
          <TableChart sx={{ fontSize: 16, color: 'primary.main' }} />
        )}
        <Typography
          variant="subtitle2"
          noWrap
          title={data.name}
          sx={{ fontWeight: 600, flex: 1 }}
        >
          {data.name}
        </Typography>
        {data.isView && (
          <Typography variant="caption" color="text.secondary">
            view
          </Typography>
        )}
      </Box>

      {data.columns.map((column) => (
        <Box
          key={column.name}
          sx={{
            position: 'relative',
            height: ER_ROW_HEIGHT,
            px: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            fontSize: 12,
          }}
        >
          <Handle
            type="target"
            id={erTargetHandleId(column.name)}
            position={Position.Left}
            isConnectable={false}
            style={hiddenHandleStyle}
          />
          <Box
            sx={{
              width: iconSpaceWidth,
              display: 'flex',
              gap: '2px',
              flexShrink: 0,
            }}
          >
            {column.isPrimaryKey && (
              <Tooltip title="Primary key">
                <Key sx={{ fontSize: 14, color: 'warning.main' }} />
              </Tooltip>
            )}
            {column.isForeignKey && (
              <Tooltip title="Points at another table">
                <LinkIcon sx={{ fontSize: 14, color: 'info.main' }} />
              </Tooltip>
            )}
          </Box>
          <Box
            component="span"
            title={column.name}
            sx={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontWeight: column.isPrimaryKey ? 600 : 400,
            }}
          >
            {column.name}
          </Box>
          <Box
            component="span"
            title={column.typeName}
            sx={{
              maxWidth: 100,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: 'text.secondary',
              fontSize: 11,
            }}
          >
            {column.typeName}
          </Box>
          <Handle
            type="source"
            id={erSourceHandleId(column.name)}
            position={Position.Right}
            isConnectable={false}
            style={hiddenHandleStyle}
          />
        </Box>
      ))}
    </Paper>
  );
});

ErTableNode.displayName = 'ErTableNode';
