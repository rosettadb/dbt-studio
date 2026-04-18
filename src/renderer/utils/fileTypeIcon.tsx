import React from 'react';
import { Box } from '@mui/material';

export function getFileTypeBadge(filename: string): {
  label: string;
  color: string;
} {
  const parts = filename.split('.');
  if (parts.length < 2) return { label: 'TXT', color: '#888' };
  const ext = parts[parts.length - 1].toLowerCase();

  switch (ext) {
    case 'ts':
    case 'tsx':
      return { label: 'TS', color: '#3178c6' };
    case 'js':
    case 'jsx':
      return { label: 'JS', color: '#f7df1e' };
    case 'sql':
      return { label: 'SQL', color: '#e8a838' };
    case 'yml':
    case 'yaml':
      return { label: 'YML', color: '#cb171e' };
    case 'md':
      return { label: 'MD', color: '#519aba' };
    case 'json':
      return { label: 'JSON', color: '#292929' };
    default:
      return { label: ext.toUpperCase().substring(0, 4), color: '#888' };
  }
}

export const FileTypeBadge: React.FC<{ filename: string }> = ({ filename }) => {
  const { label, color } = getFileTypeBadge(filename);
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color,
        backgroundColor: `${color}22`,
        border: `1px solid ${color}66`,
        fontSize: '0.55rem',
        fontWeight: 700,
        fontFamily: 'monospace',
        letterSpacing: '0.04em',
        px: 0.4,
        py: 0.05,
        borderRadius: '3px',
        lineHeight: 1.4,
        flexShrink: 0,
        minWidth: 20,
      }}
    >
      {label}
    </Box>
  );
};
