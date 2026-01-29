import React from 'react';
import { Box, Tooltip, useTheme } from '@mui/material';

export type GitStatus = 'M' | 'A' | 'D' | '??' | 'R' | 'C' | 'U' | 'staged';

interface StatusIconProps {
  status: GitStatus;
  isStaged?: boolean;
}

export const StatusIcon: React.FC<StatusIconProps> = ({ status, isStaged }) => {
  const theme = useTheme();

  const getStatusConfig = (gitStatus: GitStatus, staged: boolean) => {
    const configs = {
      M: {
        label: 'M',
        color: theme.palette.info.main, // Blue
        tooltip: staged ? 'Modified (Staged)' : 'Modified',
        bgColor: theme.palette.info.main,
      },
      A: {
        label: 'A',
        color: theme.palette.success.main, // Green
        tooltip: staged ? 'Added (Staged)' : 'Added',
        bgColor: theme.palette.success.main,
      },
      D: {
        label: 'D',
        color: theme.palette.error.main, // Red
        tooltip: staged ? 'Deleted (Staged)' : 'Deleted',
        bgColor: theme.palette.error.main,
      },
      '??': {
        label: 'U',
        color: theme.palette.text.secondary, // Gray
        tooltip: 'Untracked',
        bgColor: theme.palette.text.secondary,
      },
      R: {
        label: 'R',
        color: theme.palette.warning.main, // Orange/Purple
        tooltip: staged ? 'Renamed (Staged)' : 'Renamed',
        bgColor: theme.palette.warning.main,
      },
      C: {
        label: 'C',
        color: theme.palette.error.dark, // Dark Red
        tooltip: 'Conflicted',
        bgColor: theme.palette.error.dark,
      },
      U: {
        label: 'U',
        color: theme.palette.text.secondary,
        tooltip: 'Untracked',
        bgColor: theme.palette.text.secondary,
      },
      staged: {
        label: 'S',
        color: theme.palette.success.main,
        tooltip: 'Staged',
        bgColor: theme.palette.success.main,
      },
    };

    return configs[gitStatus] || configs['??'];
  };

  const config = getStatusConfig(status, isStaged || false);

  return (
    <Tooltip title={config.tooltip} placement="top" enterDelay={500}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 16,
          height: 16,
          borderRadius: '2px',
          backgroundColor: `${config.bgColor}20`, // 20% opacity background
          border: `1px solid ${config.color}`,
          fontSize: '9px',
          fontWeight: 600,
          color: config.color,
          fontFamily: 'monospace',
          flexShrink: 0,
        }}
      >
        {config.label}
      </Box>
    </Tooltip>
  );
};
