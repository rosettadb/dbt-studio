import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize from 'rehype-sanitize';
import { Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';

interface MarkdownPreviewProps {
  content: string;
}

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  content,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      sx={{
        flex: 1,
        overflow: 'auto',
        px: 4,
        py: 3,
        height: '100%',
        fontFamily: '"Inter", "Roboto", system-ui, sans-serif',
        fontSize: '14px',
        lineHeight: 1.7,
        color: theme.palette.text.primary,
        backgroundColor: theme.palette.background.default,

        /* Headings */
        '& h1, & h2, & h3, & h4, & h5, & h6': {
          fontWeight: 600,
          lineHeight: 1.3,
          mt: 3,
          mb: 1.5,
          color: theme.palette.text.primary,
        },
        '& h1': {
          fontSize: '2em',
          borderBottom: `1px solid ${theme.palette.divider}`,
          pb: 0.5,
        },
        '& h2': {
          fontSize: '1.5em',
          borderBottom: `1px solid ${theme.palette.divider}`,
          pb: 0.5,
        },
        '& h3': { fontSize: '1.25em' },
        '& h4': { fontSize: '1.1em' },

        /* Paragraphs */
        '& p': { mt: 0, mb: 1.5 },

        /* Links */
        '& a': {
          color: theme.palette.primary.main,
          textDecoration: 'none',
          '&:hover': { textDecoration: 'underline' },
        },

        /* Code — inline */
        '& :not(pre) > code': {
          fontFamily:
            '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
          fontSize: '0.875em',
          px: '4px',
          py: '2px',
          borderRadius: '4px',
          backgroundColor: isDark
            ? 'rgba(255,255,255,0.08)'
            : 'rgba(0,0,0,0.06)',
          color: isDark ? '#e2b96f' : '#c7254e',
        },

        /* Code — block */
        '& pre': {
          fontFamily:
            '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
          fontSize: '0.875em',
          p: 2,
          borderRadius: '8px',
          overflow: 'auto',
          backgroundColor: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.05)',
          border: `1px solid ${theme.palette.divider}`,
          mb: 2,
        },
        '& pre code': {
          backgroundColor: 'transparent',
          padding: 0,
          color: 'inherit',
          fontSize: 'inherit',
          borderRadius: 0,
        },

        /* Blockquote */
        '& blockquote': {
          borderLeft: `4px solid ${theme.palette.primary.main}`,
          pl: 2,
          ml: 0,
          mr: 0,
          color: theme.palette.text.secondary,
          fontStyle: 'italic',
          backgroundColor: isDark
            ? 'rgba(255,255,255,0.03)'
            : 'rgba(0,0,0,0.02)',
          borderRadius: '0 4px 4px 0',
          py: 0.5,
          mb: 2,
        },

        /* Tables */
        '& table': {
          borderCollapse: 'collapse',
          width: '100%',
          mb: 2,
          fontSize: '0.9em',
        },
        '& th, & td': {
          border: `1px solid ${theme.palette.divider}`,
          px: 1.5,
          py: 0.75,
          textAlign: 'left',
        },
        '& th': {
          backgroundColor: isDark
            ? 'rgba(255,255,255,0.06)'
            : 'rgba(0,0,0,0.05)',
          fontWeight: 600,
        },
        '& tr:nth-of-type(even)': {
          backgroundColor: isDark
            ? 'rgba(255,255,255,0.02)'
            : 'rgba(0,0,0,0.02)',
        },

        /* Lists */
        '& ul, & ol': { pl: 2.5, mb: 1.5 },
        '& li': { mb: 0.5 },
        '& li > p': { mb: 0.25 },

        /* Horizontal rule */
        '& hr': {
          border: 'none',
          borderTop: `1px solid ${theme.palette.divider}`,
          my: 3,
        },

        /* Images */
        '& img': { maxWidth: '100%', borderRadius: '6px' },

        /* GitHub-style alerts (> [!NOTE], > [!WARNING], etc.) */
        '& .markdown-alert': {
          borderLeft: `4px solid ${theme.palette.primary.main}`,
          pl: 2,
          mb: 2,
          borderRadius: '0 4px 4px 0',
        },
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize, rehypeHighlight]}
      >
        {content}
      </ReactMarkdown>
    </Box>
  );
};
