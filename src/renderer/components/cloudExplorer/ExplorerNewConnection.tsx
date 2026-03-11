import React from 'react';
import { useLocation } from 'react-router-dom';
import { Box } from '@mui/material';
import { ConnectionForm } from './ConnectionForm';

export const ExplorerNewConnection: React.FC = () => {
  const location = useLocation();
  const duplicateData = location.state?.duplicateFrom;
  const suggestedName = location.state?.suggestedName;

  return (
    <Box sx={{ p: 2 }}>
      <ConnectionForm
        duplicateFrom={duplicateData}
        suggestedName={suggestedName}
      />
    </Box>
  );
};
