import React, { useState } from 'react';
import { alpha, Box, Typography, IconButton, useTheme } from '@mui/material';
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
    <Box>
      {/* Section Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1,
          cursor: 'pointer',
          minHeight: '22px', // VS Code row height
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
              // Title case like VS Code ("Staged Changes", "Changes")
              fontSize: '13px',
              fontWeight: 500,
              color: 'text.primary',
            }}
          >
            {title}
          </Typography>
        </Box>

        {/* Count Badge and Actions */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            minHeight: '20px', // Fixed height to prevent jumping
          }}
        >
          {/* Actions - Show only on hover AND when count > 0 */}
          {actions && isHovered && count > 0 && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                height: '20px', // Match parent height
              }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              {actions}
            </Box>
          )}

          {/* Count Badge - Always visible as badge, shows 0 when no files */}
          <Box
            sx={{
              // VS Code badge sizing (18px / 11px): a 9-10px digit in a 16px
              // badge always ends up half a pixel off-centre.
              fontSize: '11px',
              fontWeight: 500,
              // Neutral VS Code-style count badge (#444 / white in dark mode)
              color:
                theme.palette.mode === 'dark'
                  ? theme.palette.common.white
                  : theme.palette.text.primary,
              backgroundColor:
                theme.palette.mode === 'dark'
                  ? alpha(theme.palette.common.white, 0.16)
                  : theme.palette.grey[400],
              borderRadius: '9px', // circle for 1 digit, pill for more
              minWidth: '18px',
              height: '18px',
              px: '4px',
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {count}
          </Box>
        </Box>
      </Box>

      {/* Section Content */}
      {isExpanded && <Box sx={{ pl: 0.5, pt: 0.25 }}>{children}</Box>}
    </Box>
  );
};
