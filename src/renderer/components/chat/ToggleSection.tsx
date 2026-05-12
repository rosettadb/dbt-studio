import React from 'react';
import { Box, Collapse, Typography } from '@mui/material';
import { ChevronRight } from '@mui/icons-material';

interface ToggleSectionProps {
  title: React.ReactNode;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export const ToggleSection: React.FC<ToggleSectionProps> = ({
  title,
  icon,
  defaultOpen = false,
  children,
}) => {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box
        onClick={() => setOpen((p) => !p)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.25,
          cursor: 'pointer',
          userSelect: 'none',
          minWidth: 0,
          overflow: 'hidden',
          fontSize: '12px',
          '&:hover': { filter: 'brightness(1.25)' },
        }}
      >
        {icon ?? (
          <ChevronRight
            sx={{
              fontSize: 12,
              flexShrink: 0,
              transition: 'transform 0.2s ease',
              transform: open ? 'rotate(90deg)' : 'none',
            }}
          />
        )}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: '12px',
          }}
        >
          {title}
        </Typography>
      </Box>
      <Collapse in={open} timeout={300}>
        <Box sx={{ mt: 0.25, maxHeight: '50vh', overflowY: 'auto' }}>
          {children}
        </Box>
      </Collapse>
    </Box>
  );
};
