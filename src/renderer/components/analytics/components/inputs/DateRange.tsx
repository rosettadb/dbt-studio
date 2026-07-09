import React, { useState } from 'react';
import { Box, TextField, Typography, Stack } from '@mui/material';
import { getStringProp } from '../../../../utils/analyticsComponentProps';
import type { ParsedProps } from '../../../../utils/analyticsComponentProps';
import type { AnalyticsComponentProps } from '../../registry/analyticsComponentRegistry';

type Props = AnalyticsComponentProps & {
  chartProps?: ParsedProps;
};

export const AnalyticsDateRange: React.FC<Props> = ({ chartProps = {} }) => {
  const title = getStringProp(chartProps, 'title', 'Date Range');
  const defaultStart = getStringProp(chartProps, 'start');
  const defaultEnd = getStringProp(chartProps, 'end');

  const [start, setStart] = useState(defaultStart || '');
  const [end, setEnd] = useState(defaultEnd || '');

  return (
    <Box sx={{ mb: 2 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        display="block"
        sx={{ mb: 0.5 }}
      >
        {title}
      </Typography>
      <Stack direction="row" spacing={1}>
        <TextField
          type="date"
          size="small"
          label="Start"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: 140 }}
        />
        <TextField
          type="date"
          size="small"
          label="End"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: 140 }}
        />
      </Stack>
    </Box>
  );
};
