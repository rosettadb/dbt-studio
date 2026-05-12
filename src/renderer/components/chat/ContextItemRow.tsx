import React from 'react';
import { Box, Typography } from '@mui/material';
import { getFileTypeBadge } from '../../utils/fileTypeIcon';

interface ContextItemRowProps {
  name: string;
  description: string;
  filePath?: string;
  onOpen?: (path: string) => void;
}

export const ContextItemRow: React.FC<ContextItemRowProps> = ({
  name,
  description,
  filePath,
  onOpen,
}) => {
  const badge = getFileTypeBadge(name);
  return (
    <Box
      onClick={() => filePath && onOpen?.(filePath)}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1,
        py: 0.5,
        borderRadius: 0.5,
        minWidth: 0,
        cursor: filePath ? 'pointer' : 'default',
        '&:hover': filePath ? { bgcolor: 'action.hover' } : {},
      }}
    >
      <Box
        sx={{
          fontSize: '10px',
          fontWeight: 700,
          px: 0.5,
          py: 0.1,
          borderRadius: 0.25,
          bgcolor: `${badge.color}22`,
          color: badge.color,
          flexShrink: 0,
        }}
      >
        {badge.label}
      </Box>
      <Typography variant="caption" sx={{ fontWeight: 500, flexShrink: 0 }}>
        {name}
      </Typography>
      <Typography
        variant="caption"
        color="text.disabled"
        sx={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}
      >
        {description}
      </Typography>
    </Box>
  );
};
