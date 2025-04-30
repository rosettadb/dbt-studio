import React from 'react';
import { GlobalStyles } from '@mui/material';
import { useTheme } from '@mui/material/styles';

/**
 * ScrollbarStyles component applies consistent macOS-like scrollbar styling across the application
 * using the current MUI theme colors for better integration with light/dark modes.
 */
export const ScrollbarStyles: React.FC = () => {
  const theme = useTheme();

  // Determine scrollbar colors based on current theme
  const thumbColor = theme.palette.mode === 'dark' 
    ? theme.palette.grey[700]
    : theme.palette.grey[400];
  
  const thumbHoverColor = theme.palette.mode === 'dark'
    ? theme.palette.grey[600]
    : theme.palette.grey[500];
  
  const trackColor = 'transparent';

  return (
    <GlobalStyles
      styles={{
        '*': {
          // Firefox scrollbar styling
          scrollbarWidth: 'thin',
          scrollbarColor: `${thumbColor} ${trackColor}`,
        },
        '*::-webkit-scrollbar': {
          width: '8px',
          height: '8px',
        },
        '*::-webkit-scrollbar-track': {
          background: trackColor,
          borderRadius: '4px',
        },
        '*::-webkit-scrollbar-thumb': {
          backgroundColor: thumbColor,
          borderRadius: '4px',
          '&:hover': {
            backgroundColor: thumbHoverColor,
          },
        },
        '*::-webkit-scrollbar-corner': {
          background: trackColor,
        },
      }}
    />
  );
};