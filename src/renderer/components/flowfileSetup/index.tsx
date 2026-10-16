import React from 'react';
import { Box, Checkbox, Typography } from '@mui/material';

type Props = {
  includeFlowfile: boolean;
  setIncludeFlowfile: (includeFlowfile: boolean) => void;
};

export const FlowfileChoice: React.FC<Props> = ({
  includeFlowfile,
  setIncludeFlowfile,
}) => (
  <Box
    component="label"
    sx={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 1,
      cursor: 'pointer',
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
);
