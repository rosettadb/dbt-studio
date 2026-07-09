import React, { useState } from 'react';
import {
  Accordion as MuiAccordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
} from '@mui/material';
import { ExpandMore } from '@mui/icons-material';
import {
  getStringProp,
  getBooleanProp,
} from '../../../../utils/analyticsComponentProps';
import type { ParsedProps } from '../../../../utils/analyticsComponentProps';
import type { AnalyticsComponentProps } from '../../registry/analyticsComponentRegistry';

type Props = AnalyticsComponentProps & {
  chartProps?: ParsedProps;
};

export const AnalyticsAccordion: React.FC<Props> = ({
  chartProps = {},
  children,
}) => {
  const title = getStringProp(chartProps, 'title', 'Accordion');
  const defaultExpanded = getBooleanProp(chartProps, 'defaultExpanded');
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <MuiAccordion
      expanded={expanded}
      onChange={() => setExpanded(!expanded)}
      sx={{ mb: 1 }}
    >
      <AccordionSummary expandIcon={<ExpandMore />}>
        <Typography variant="subtitle2" fontWeight={600}>
          {title}
        </Typography>
      </AccordionSummary>
      <AccordionDetails>{children}</AccordionDetails>
    </MuiAccordion>
  );
};
