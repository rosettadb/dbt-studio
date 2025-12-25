import React from 'react';
import { Box, Breadcrumbs as MuiBreadcrumbs, Typography } from '@mui/material';
import { NavigateNext } from '@mui/icons-material';

interface BreadcrumbsProps {
  filePath: string;
  projectPath: string;
  onNavigate?: (path: string) => void;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
  filePath,
  projectPath,
  onNavigate,
}) => {
  // Parse file path into segments
  const relativePath = filePath.replace(projectPath, '').replace(/^\//, '');
  const segments = relativePath.split('/');

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 2,
        py: 1,
        backgroundColor: 'background.paper',
      }}
    >
      <MuiBreadcrumbs
        separator={<NavigateNext sx={{ fontSize: 16 }} />}
        sx={{
          fontSize: 13,
          '& .MuiBreadcrumbs-separator': {
            mx: 0.25,
          },
        }}
      >
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;
          const segmentPath = segments.slice(0, index + 1).join('/');

          return isLast ? (
            <Typography
              key={segment}
              sx={{
                fontSize: 13,
                fontWeight: 500,
                color: 'text.primary',
              }}
            >
              {segment}
            </Typography>
          ) : (
            <Typography
              key={segment}
              onClick={() => onNavigate?.(segmentPath)}
              sx={{
                fontSize: 13,
                color: 'text.secondary',
                cursor: 'pointer',
                '&:hover': {
                  color: 'primary.main',
                  textDecoration: 'underline',
                },
              }}
            >
              {segment}
            </Typography>
          );
        })}
      </MuiBreadcrumbs>
    </Box>
  );
};
