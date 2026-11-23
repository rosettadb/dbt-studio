import React from 'react';
import { Box, Typography, Link } from '@mui/material';
import type { Components } from 'react-markdown';

// ─── react-markdown component overrides ──────────────────────────────────
export const markdownComponents: Components = {
  h1: ({ children }) => (
    <Typography variant="h4" gutterBottom sx={{ mt: 2 }}>
      {children}
    </Typography>
  ),
  h2: ({ children }) => (
    <Typography variant="h5" gutterBottom sx={{ mt: 2 }}>
      {children}
    </Typography>
  ),
  h3: ({ children }) => (
    <Typography variant="h6" gutterBottom sx={{ mt: 1.5 }}>
      {children}
    </Typography>
  ),
  h4: ({ children }) => (
    <Typography
      variant="subtitle1"
      fontWeight={600}
      gutterBottom
      sx={{ mt: 1 }}
    >
      {children}
    </Typography>
  ),
  p: ({ children }) => (
    <Typography variant="body2" sx={{ lineHeight: 1.75, mb: 1 }}>
      {children}
    </Typography>
  ),
  a: ({ children, href }) => (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      underline="hover"
    >
      {children}
    </Link>
  ),
  code: ({ children }) => (
    <code
      style={{
        background: 'rgba(0,0,0,0.06)',
        padding: '1px 4px',
        borderRadius: 3,
        fontFamily: 'monospace',
        fontSize: '0.875em',
      }}
    >
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <Box
      component="pre"
      sx={{
        bgcolor: 'action.hover',
        p: 1.5,
        borderRadius: 1,
        overflow: 'auto',
        fontSize: '0.8rem',
        fontFamily: 'monospace',
        mb: 1,
      }}
    >
      {children}
    </Box>
  ),
  blockquote: ({ children }) => (
    <Box
      component="blockquote"
      sx={{
        borderLeft: 3,
        borderColor: 'primary.main',
        pl: 2,
        my: 1,
        color: 'text.secondary',
        fontStyle: 'italic',
      }}
    >
      {children}
    </Box>
  ),
  hr: () => (
    <Box
      component="hr"
      sx={{ border: 'none', borderTop: 1, borderColor: 'divider', my: 2 }}
    />
  ),
  ul: ({ children }) => (
    <Box component="ul" sx={{ pl: 2, mb: 1 }}>
      {children}
    </Box>
  ),
  ol: ({ children }) => (
    <Box component="ol" sx={{ pl: 2, mb: 1 }}>
      {children}
    </Box>
  ),
  li: ({ children }) => (
    <Typography component="li" variant="body2" sx={{ lineHeight: 1.8 }}>
      {children}
    </Typography>
  ),
  table: ({ children }) => (
    <Box
      component="table"
      sx={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '0.8rem',
        mb: 1,
        '& th, & td': {
          border: 1,
          borderColor: 'divider',
          px: 1.5,
          py: 1,
          textAlign: 'left',
        },
        '& th': {
          fontWeight: 600,
          bgcolor: 'action.hover',
        },
      }}
    >
      {children}
    </Box>
  ),
};
