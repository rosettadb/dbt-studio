import React from 'react';
import { Box } from '@mui/material';
import { DuckDBWorkspaceCard } from './DuckDBWorkspaceCard';

export const DuckDBSettings: React.FC = () => {
  return (
    <Box mt={3}>
      <DuckDBWorkspaceCard />
    </Box>
  );
};
