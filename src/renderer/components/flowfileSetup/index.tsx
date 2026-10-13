import React from 'react';
import { Box, Checkbox, Typography } from '@mui/material';

type Props = {
  includeFlowfile: boolean;
  setIncludeFlowfile: (includeFlowfile: boolean) => void;
};

export const FlowfileSetup: React.FC<Props> = ({
  includeFlowfile,
  setIncludeFlowfile,
}) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
    <Typography sx={{ fontSize: 14, fontWeight: 500 }}>
      Optional tools
    </Typography>
    <Box
      component="label"
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1,
        p: 1.25,
        cursor: 'pointer',
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Checkbox
        size="small"
        checked={includeFlowfile}
        onChange={(event) => setIncludeFlowfile(event.target.checked)}
        sx={{ p: 0.25 }}
        data-testid="setup-flowfile-checkbox"
        inputProps={{ 'aria-label': 'Flowfile' }}
      />
      <Box>
        <Typography sx={{ fontSize: 13, fontWeight: 500 }}>Flowfile</Typography>
        <Typography variant="body2" color="text.secondary">
          Visual data pipeline editor. You can also add it later in Settings.
        </Typography>
      </Box>
    </Box>
    <Typography variant="body2" color="text.secondary">
      Install sets up everything you picked, plus Python and the local runner,
      which are always needed.
    </Typography>
  </Box>
);
