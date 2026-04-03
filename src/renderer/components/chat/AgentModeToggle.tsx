// Agent Mode Toggle - Switch between Chat and Agent modes

import React from 'react';
import {
  Box,
  Switch,
  FormControlLabel,
  Tooltip,
  Typography,
  Chip,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ChatIcon from '@mui/icons-material/Chat';

interface AgentModeToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}

export const AgentModeToggle: React.FC<AgentModeToggleProps> = ({
  enabled,
  onChange,
  disabled = false,
}) => {
  const theme = useTheme();

  const isDarkMode = theme.palette.mode === 'dark';

  const getBackgroundColor = () => {
    if (!enabled) return 'transparent';
    return isDarkMode
      ? 'rgba(144, 202, 249, 0.08)'
      : 'rgba(25, 118, 210, 0.08)';
  };

  const getBorderColor = () => {
    if (enabled) return theme.palette.primary.main;
    return isDarkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)';
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        padding: '8px 12px',
        borderRadius: 1,
        backgroundColor: getBackgroundColor(),
        border: `1px solid ${getBorderColor()}`,
        transition: 'all 0.2s ease-in-out',
      }}
    >
      <Tooltip
        title={
          enabled
            ? 'Agent mode: AI can use tools to read files, run dbt commands, and perform actions'
            : 'Chat mode: Standard conversational AI without tool access'
        }
        placement="top"
      >
        <FormControlLabel
          control={
            <Switch
              checked={enabled}
              onChange={(e) => onChange(e.target.checked)}
              disabled={disabled}
              size="small"
              sx={{
                '& .MuiSwitch-switchBase.Mui-checked': {
                  color: theme.palette.primary.main,
                },
                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                  backgroundColor: theme.palette.primary.main,
                },
              }}
            />
          }
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {enabled ? (
                <SmartToyIcon fontSize="small" color="primary" />
              ) : (
                <ChatIcon fontSize="small" />
              )}
              <Typography variant="body2" fontWeight={enabled ? 600 : 400}>
                {enabled ? 'Agent Mode' : 'Chat Mode'}
              </Typography>
              {enabled && (
                <Chip
                  label="BETA"
                  size="small"
                  color="primary"
                  sx={{
                    height: 18,
                    fontSize: '0.65rem',
                    fontWeight: 700,
                  }}
                />
              )}
            </Box>
          }
          sx={{ margin: 0 }}
        />
      </Tooltip>
    </Box>
  );
};
