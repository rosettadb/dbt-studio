import React from 'react';
import { Box, Collapse, Typography } from '@mui/material';
import { ExpandMore } from '@mui/icons-material';

// A bordered list that holds setup choice rows, with a line between rows.
export const setupChoiceListSx = {
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1,
  overflow: 'hidden',
  '& > * + *': { borderTop: '1px solid', borderColor: 'divider' },
} as const;

type Props = {
  // Radio button or icon shown before the title.
  leading: React.ReactNode;
  title: React.ReactNode;
  description?: string;
  // Short text on the right, e.g. the chosen version.
  summary?: React.ReactNode;
  isSelected?: boolean;
  isOpen: boolean;
  onToggle: () => void;
  testId: string;
  children: React.ReactNode;
};

// One setup choice: a clickable header that opens and closes its content.
export const SetupChoiceRow: React.FC<Props> = ({
  leading,
  title,
  description,
  summary,
  isSelected = false,
  isOpen,
  onToggle,
  testId,
  children,
}) => (
  <Box data-testid={testId}>
    <Box
      role="button"
      aria-expanded={isOpen}
      onClick={onToggle}
      data-testid={`${testId}-header`}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        px: 1.5,
        py: 1,
        cursor: 'pointer',
        color: 'text.secondary',
        bgcolor: isSelected ? 'action.selected' : 'transparent',
      }}
    >
      {leading}
      <Box sx={{ flex: 1, minWidth: 0, color: 'text.primary' }}>
        <Typography component="div" sx={{ fontSize: 13, fontWeight: 500 }}>
          {title}
        </Typography>
        {description && (
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        )}
      </Box>
      {summary && (
        <Typography
          variant="body2"
          color={isSelected ? 'primary' : 'text.secondary'}
          sx={{ whiteSpace: 'nowrap' }}
          data-testid={`${testId}-summary`}
        >
          {summary}
        </Typography>
      )}
      <ExpandMore
        fontSize="small"
        sx={{
          transform: isOpen ? 'rotate(180deg)' : 'none',
          transition: 'transform 150ms',
        }}
      />
    </Box>
    <Collapse in={isOpen} unmountOnExit>
      <Box sx={{ px: 1.5, pt: 0.5, pb: 1.25 }}>{children}</Box>
    </Collapse>
  </Box>
);
