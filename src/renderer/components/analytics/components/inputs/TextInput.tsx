import React, { useState } from 'react';
import { TextField, Box } from '@mui/material';
import { getStringProp } from '../../../../utils/analyticsComponentProps';
import type { ParsedProps } from '../../../../utils/analyticsComponentProps';
import type { AnalyticsComponentProps } from '../../registry/analyticsComponentRegistry';

type Props = AnalyticsComponentProps & {
  chartProps?: ParsedProps;
};

export const AnalyticsTextInput: React.FC<Props> = ({ chartProps = {} }) => {
  const label = getStringProp(chartProps, 'label', 'Text');
  const placeholder = getStringProp(chartProps, 'placeholder', '');
  const [value, setValue] = useState('');

  return (
    <Box sx={{ mb: 2, minWidth: 200 }}>
      <TextField
        size="small"
        label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        fullWidth
      />
    </Box>
  );
};
