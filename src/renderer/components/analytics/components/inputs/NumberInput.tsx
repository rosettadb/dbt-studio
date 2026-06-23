import React, { useState } from 'react';
import { TextField, Box } from '@mui/material';
import { getStringProp } from '../../../../utils/analyticsComponentProps';
import type { ParsedProps } from '../../../../utils/analyticsComponentProps';
import type { AnalyticsComponentProps } from '../../registry/analyticsComponentRegistry';

type Props = AnalyticsComponentProps & {
  chartProps?: ParsedProps;
};

export const AnalyticsNumberInput: React.FC<Props> = ({ chartProps = {} }) => {
  const label = getStringProp(chartProps, 'label', 'Value');
  const defaultValue = getStringProp(chartProps, 'default');
  const [value, setValue] = useState(defaultValue || '');

  return (
    <Box sx={{ mb: 2, minWidth: 160 }}>
      <TextField
        type="number"
        size="small"
        label={label}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        fullWidth
      />
    </Box>
  );
};
