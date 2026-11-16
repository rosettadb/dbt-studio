import React from 'react';
import { Box } from '@mui/material';
import { path as nodePath, isInside } from '../../lib/path';

// Helpers for showing find-in-files results (used by the command palette).

export const toRelativePath = (
  filePath: string,
  projectPath: string,
): string => {
  if (!projectPath || !isInside(projectPath, filePath)) return filePath;
  return nodePath.relative(projectPath, filePath);
};

export const HighlightedLine: React.FC<{
  text: string;
  column: number;
  length: number;
}> = ({ text, column, length }) => {
  const start = Math.max(0, Math.min(text.length, column - 1));
  const end = Math.max(start, Math.min(text.length, start + length));
  return (
    <>
      {text.slice(0, start)}
      <Box
        component="mark"
        sx={{
          bgcolor: 'warning.light',
          color: 'grey.900',
          borderRadius: 0.5,
        }}
      >
        {text.slice(start, end)}
      </Box>
      {text.slice(end)}
    </>
  );
};
