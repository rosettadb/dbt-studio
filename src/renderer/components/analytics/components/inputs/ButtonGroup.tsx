import React, { useState } from 'react';
import {
  ToggleButtonGroup as MuiToggleButtonGroup,
  ToggleButton,
  Box,
  Typography,
} from '@mui/material';
import {
  getStringProp,
  getBooleanProp,
} from '../../../../utils/analyticsComponentProps';
import type { ParsedProps } from '../../../../utils/analyticsComponentProps';
import type { AnalyticsComponentProps } from '../../registry/analyticsComponentRegistry';

type Props = AnalyticsComponentProps & {
  chartProps?: ParsedProps;
};

export const AnalyticsButtonGroup: React.FC<Props> = ({
  chartProps = {},
  data = [],
}) => {
  const optionsStr = getStringProp(chartProps, 'options');
  const defaultValue = getStringProp(chartProps, 'default');
  const multiple = getBooleanProp(chartProps, 'multiple');
  const title = getStringProp(chartProps, 'title');

  // If options provided as comma-separated string
  let options: string[] = [];
  if (optionsStr) {
    options = optionsStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  } else if (data.length > 0) {
    const valueCol =
      getStringProp(chartProps, 'value') || Object.keys(data[0])[0];
    options = data.map((row: any) => String(row[valueCol] ?? ''));
  }

  let initialValue: string | string[];
  if (multiple) {
    initialValue = defaultValue ? [defaultValue] : [];
  } else {
    initialValue = defaultValue ?? '';
  }
  const [value, setValue] = useState<string | string[]>(initialValue);

  if (options.length === 0) return null;

  return (
    <Box sx={{ mb: 2 }}>
      {title && (
        <Typography
          variant="caption"
          color="text.secondary"
          display="block"
          sx={{ mb: 0.5 }}
        >
          {title}
        </Typography>
      )}
      <MuiToggleButtonGroup
        value={value}
        onChange={(_, v) => setValue(v)}
        exclusive={!multiple}
        size="small"
      >
        {options.map((opt) => (
          <ToggleButton
            key={opt}
            value={opt}
            sx={{ textTransform: 'none', fontSize: '0.8rem' }}
          >
            {opt}
          </ToggleButton>
        ))}
      </MuiToggleButtonGroup>
    </Box>
  );
};
