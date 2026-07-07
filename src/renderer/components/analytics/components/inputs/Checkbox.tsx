import React, { useState } from 'react';
import { Checkbox as MuiCheckbox, FormControlLabel, Box } from '@mui/material';
import { getStringProp } from '../../../../utils/analyticsComponentProps';
import type { ParsedProps } from '../../../../utils/analyticsComponentProps';
import type { AnalyticsComponentProps } from '../../registry/analyticsComponentRegistry';

type Props = AnalyticsComponentProps & {
  chartProps?: ParsedProps;
};

export const AnalyticsCheckbox: React.FC<Props> = ({ chartProps = {} }) => {
  const label = getStringProp(chartProps, 'label', 'Option');
  const [checked, setChecked] = useState(false);

  return (
    <Box sx={{ mb: 1 }}>
      <FormControlLabel
        control={
          <MuiCheckbox
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            size="small"
          />
        }
        label={label}
      />
    </Box>
  );
};
