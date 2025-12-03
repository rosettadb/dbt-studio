import React, { useState } from 'react';
import { Box, Typography, IconButton, useTheme } from '@mui/material';
import { ExpandMore, ExpandLess } from '@mui/icons-material';

interface CollapsibleSectionProps {
  title: string;
  count?: number;
  defaultExpanded?: boolean;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  count = 0,
  defaultExpanded = true,
  children,
  actions,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isHovered, setIsHovered] = useState(false);
  const theme = useTheme();

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <Box sx={{ mb: 0.5 }}>
      {/* Section Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1,
          py: 0.25,
          cursor: 'pointer',
          minHeight: '24px',
          '&:hover': {
            backgroundColor: 'action.hover',
          },
        }}
        onClick={toggleExpanded}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Title and Expand Icon */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flex: 1 }}>
          <IconButton
            size="small"
            sx={{
              width: 16,
              height: 16,
              p: 0,
              color: 'text.secondary',
            }}
          >
            {isExpanded ? (
              <ExpandMore sx={{ fontSize: 16 }} />
            ) : (
              <ExpandLess sx={{ fontSize: 16, transform: 'rotate(90deg)' }} />
            )}
          </IconButton>

          <Typography
            variant="body2"
            sx={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'text.secondary',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {title}
          </Typography>
        </Box>

        {/* Count Badge and Actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {/* Actions - Show only on hover */}
          {actions && isHovered && (
            <Box
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              {actions}
            </Box>
          )}

          {/* Count Badge - Always visible */}
          {count > 0 && (
            <Typography
              variant="body2"
              sx={{
                fontSize: '10px',
                fontWeight: 500,
                color: 'primary.contrastText',
                backgroundColor: 'primary.main',
                borderRadius: theme.shape.borderRadius, // Use theme border radius
                px: 0.5,
                py: 0.25,
                minWidth: '16px',
                textAlign: 'center',
              }}
            >
              {count}
            </Typography>
          )}
        </Box>
      </Box>

      {/* Section Content */}
      {isExpanded && <Box sx={{ pl: 0.5, pt: 0.25 }}>{children}</Box>}
    </Box>
  );
};
