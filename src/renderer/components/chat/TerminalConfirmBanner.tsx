import React from 'react';
import { Box, Button, Typography, Paper } from '@mui/material';
import TerminalIcon from '@mui/icons-material/Terminal';
import type { TerminalConfirmRequest } from '../../hooks/useAgentStream';

interface TerminalConfirmBannerProps {
  request: TerminalConfirmRequest;
  onAllow: () => void;
  onDeny: () => void;
}

export const TerminalConfirmBanner: React.FC<TerminalConfirmBannerProps> = ({
  request,
  onAllow,
  onDeny,
}) => {
  return (
    <Paper
      elevation={0}
      sx={{
        px: 1,
        py: 0.5,
        mb: 0.25,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.25,
        bgcolor: 'action.hover',
        border: '1px solid',
        borderColor: 'warning.dark',
        borderRadius: 0.5,
        minWidth: 0,
      }}
    >
      {/* Header row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <TerminalIcon
          sx={{ fontSize: 12, color: 'warning.main', flexShrink: 0 }}
        />
        <Typography
          variant="caption"
          sx={{ color: 'warning.main', fontWeight: 600, fontSize: '11px' }}
        >
          Agent wants to run a command:
        </Typography>
      </Box>

      {/* Command box */}
      <Box
        sx={{
          px: 0.5,
          py: 0.25,
          bgcolor: 'background.default',
          borderRadius: 0.5,
          fontFamily: 'monospace',
          fontSize: '11px',
          border: '1px solid',
          borderColor: 'divider',
          overflowX: 'auto',
          whiteSpace: 'pre-wrap',
          color: 'text.primary',
        }}
      >
        {request.command}
      </Box>

      {/* cwd + buttons row */}
      <Box
        sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}
      >
        <Typography
          variant="caption"
          sx={{
            fontFamily: 'monospace',
            fontSize: '10px',
            color: 'text.disabled',
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          cwd: {request.cwd}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.25, flexShrink: 0 }}>
          <Button
            size="small"
            color="inherit"
            onClick={onDeny}
            sx={{ minWidth: 'unset', px: 1, py: 0.125, fontSize: '11px' }}
          >
            Deny
          </Button>
          <Button
            size="small"
            variant="contained"
            color="warning"
            onClick={onAllow}
            sx={{ minWidth: 'unset', px: 1, py: 0.125, fontSize: '11px' }}
          >
            Allow
          </Button>
        </Box>
      </Box>
    </Paper>
  );
};
