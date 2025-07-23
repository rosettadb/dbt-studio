import React from 'react';
import { Box } from '@mui/material';
import { ConnectionForm } from './ConnectionForm';

export const ExplorerNewConnection: React.FC = () => {
  return (
    <Box sx={{ p: 2 }}>
      <ConnectionForm />
    </Box>
  );
};
