import React from 'react';
import { Box, Typography } from '@mui/material';
import ExtensionIcon from '@mui/icons-material/Extension';

export const MCPServersTab: React.FC = () => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 300,
      gap: 2,
      color: 'text.secondary',
    }}
  >
    <ExtensionIcon sx={{ fontSize: 48, opacity: 0.3 }} />
    <Typography variant="h6" color="text.secondary">
      MCP Servers
    </Typography>
    <Typography variant="body2" color="text.disabled" textAlign="center">
      Model Context Protocol server management coming soon.
    </Typography>
  </Box>
);
