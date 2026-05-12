import React from 'react';
import { Box } from '@mui/material';
import { ToggleSection } from './ToggleSection';

interface ToolCallGroupProps {
  label: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

export const ToolCallGroup: React.FC<ToolCallGroupProps> = ({
  label,
  defaultExpanded = true,
  children,
}) => {
  if (!children || React.Children.count(children) === 0) {
    return null; // Hidden if empty
  }

  return (
    <Box
      sx={{
        my: 0.125,
        borderLeft: '2px solid',
        borderColor: 'divider',
        ml: 1,
        pl: 1,
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <ToggleSection title={label} defaultOpen={defaultExpanded}>
        <Box sx={{ pl: 0.25, pt: 0 }}>{children}</Box>
      </ToggleSection>
    </Box>
  );
};
