import React from 'react';
import { Box, IconButton } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Close as CloseIcon } from '@mui/icons-material';
import { useContextManager } from '../../hooks/useContextManager';

interface ContextTabsProps {
  contextManager: ReturnType<typeof useContextManager>;
}

export const ContextTabs: React.FC<ContextTabsProps> = ({ contextManager }) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        px: 1,
        pt: 0.5,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 0.5,
        alignItems: 'center',
        minHeight: 28,
      }}
    >
      {contextManager.additionalFiles.map((file) => (
        <Box
          key={file.path}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            px: 0.5,
            py: 0.1,
            borderRadius: 0.5,
            border: `1px solid ${theme.palette.divider}`,
            fontSize: '0.65rem',
            color: 'text.primary',
            '&:hover': { backgroundColor: theme.palette.action.selected },
          }}
        >
          <Box component="span" sx={{ fontSize: '0.65rem' }}>
            {file.name}
          </Box>
          <IconButton
            size="small"
            onClick={() => contextManager.removeFile(file.path)}
            sx={{
              width: 16,
              height: 16,
              ml: 0.5,
              color: 'text.secondary',
              '&:hover': {
                color: 'text.primary',
                backgroundColor: theme.palette.action.hover,
              },
            }}
          >
            <CloseIcon sx={{ fontSize: '0.7rem' }} />
          </IconButton>
        </Box>
      ))}
    </Box>
  );
};
