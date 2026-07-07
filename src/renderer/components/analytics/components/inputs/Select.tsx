import React, { useState } from 'react';
import {
  FormControl,
  InputLabel,
  Select as MuiSelect,
  MenuItem,
  Box,
} from '@mui/material';
import { getStringProp } from '../../../../utils/analyticsComponentProps';
import type { ParsedProps } from '../../../../utils/analyticsComponentProps';
import type { AnalyticsComponentProps } from '../../registry/analyticsComponentRegistry';

type Props = AnalyticsComponentProps & {
  chartProps?: ParsedProps;
};

export const AnalyticsSelect: React.FC<Props> = ({
  chartProps = {},
  data = [],
}) => {
  const valueCol = getStringProp(chartProps, 'value');
  const label =
    getStringProp(chartProps, 'label') ||
    getStringProp(chartProps, 'title') ||
    'Select';
  const defaultValue = getStringProp(chartProps, 'default');

  const options: string[] = (data as Record<string, unknown>[])
    .filter((row) => valueCol && row[valueCol] !== undefined)
    .map((row) => String(row[valueCol]));

  const [value, setValue] = useState(
    defaultValue || (options.length > 0 ? options[0] : ''),
  );

  if (options.length === 0) return null;

  return (
    <Box sx={{ mb: 2, minWidth: 200 }}>
      <FormControl fullWidth size="small">
        <InputLabel>{label}</InputLabel>
        <MuiSelect
          value={value}
          label={label}
          onChange={(e) => setValue(e.target.value)}
        >
          {options.map((opt) => (
            <MenuItem key={opt} value={opt}>
              {opt}
            </MenuItem>
          ))}
        </MuiSelect>
      </FormControl>
    </Box>
  );
};
