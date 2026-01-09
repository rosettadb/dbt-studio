import React from 'react';
import {
  Stack,
  Typography,
  Select,
  MenuItem,
  SelectChangeEvent,
  IconButton,
  Tooltip,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';

type LineageToolbarProps = {
  depth: number;
  onDepthChange: (value: number) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  disabled?: boolean;
  extraActions?: React.ReactNode;
};

const depthOptions = [1, 2, 3, 4];

export const LineageToolbar: React.FC<LineageToolbarProps> = ({
  depth,
  onDepthChange,
  onRefresh,
  isRefreshing,
  disabled,
  extraActions,
}) => {
  const handleDepthChange = (event: SelectChangeEvent<number>) => {
    const value = Number(event.target.value);
    onDepthChange(value);
  };

  return (
    <Stack
      direction="row"
      spacing={2}
      alignItems="center"
      justifyContent="space-between"
      sx={{
        borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
        pb: 1,
      }}
    >
      <Stack direction="row" spacing={2} alignItems="center">
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="caption" color="text.secondary">
            Depth
          </Typography>
          <Select
            size="small"
            value={depth as unknown as number}
            onChange={handleDepthChange}
            disabled={disabled}
            sx={{
              minWidth: 60,
              height: 28,
              fontSize: '0.8125rem',
              '.MuiSelect-select': {
                paddingTop: '4px',
                paddingBottom: '4px',
              },
            }}
          >
            {depthOptions.map((option) => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </Select>
        </Stack>
      </Stack>
      <Stack direction="row" spacing={1} alignItems="center">
        {onRefresh && (
          <Tooltip title="Refresh lineage">
            <span>
              <IconButton
                onClick={onRefresh}
                disabled={disabled || isRefreshing}
                size="small"
              >
                <RefreshIcon
                  fontSize="small"
                  sx={{
                    animation: isRefreshing
                      ? 'spin 1.2s linear infinite'
                      : 'none',
                    '@keyframes spin': {
                      '0%': { transform: 'rotate(0deg)' },
                      '100%': { transform: 'rotate(360deg)' },
                    },
                  }}
                />
              </IconButton>
            </span>
          </Tooltip>
        )}
        {extraActions}
      </Stack>
    </Stack>
  );
};
