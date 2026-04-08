import React from 'react';
import { Box, Typography } from '@mui/material';
import PsychologyIcon from '@mui/icons-material/Psychology';

export const SkillsTab: React.FC = () => (
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
    <PsychologyIcon sx={{ fontSize: 48, opacity: 0.3 }} />
    <Typography variant="h6" color="text.secondary">
      Skills
    </Typography>
    <Typography variant="body2" color="text.disabled" textAlign="center">
      AI agent skills library coming soon.
    </Typography>
  </Box>
);
