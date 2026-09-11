/**
 * Markdown cell editor and preview shared by SQL and Python notebooks.
 */

import React, { useState } from 'react';
import { Box, IconButton, Link, Paper, Typography } from '@mui/material';
import {
  Edit as EditIcon,
  Visibility as PreviewIcon,
} from '@mui/icons-material';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { NotebookCell } from '../../../types/notebooks';

interface MarkdownCellProps {
  /** SQL notebook cell. Use content for a Python notebook markdown cell. */
  cell?: Pick<NotebookCell, 'content'>;
  content?: string;
  attachmentResolver?: (href: string) => string | null;
  onUpdate: (content: string) => void;
}

const isExternalUrl = (href: string) => {
  try {
    const url = new URL(href);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol);
  } catch {
    return false;
  }
};

const isSafeImageUrl = (src: string) =>
  src.startsWith('https://') ||
  (/^data:image\/(png|jpe?g);base64,/i.test(src) && src.length <= 4_000_000);

const createMarkdownComponents = (
  attachmentResolver?: (href: string) => string | null,
): Components => ({
  a: ({ children, href }) => (
    <Link
      component="a"
      href={href}
      underline="hover"
      onClick={(event) => {
        if (!href) {
          event.preventDefault();
          return;
        }

        if (href.startsWith('#')) {
          event.preventDefault();
          document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
          return;
        }

        if (!isExternalUrl(href)) {
          event.preventDefault();
          return;
        }

        event.preventDefault();
        window.electron.ipcRenderer
          .invoke('open:external', href)
          .catch(() => undefined);
      }}
    >
      {children}
    </Link>
  ),
  img: ({ src, alt }) => {
    const resolved = src?.startsWith('attachment:')
      ? (attachmentResolver?.(src) ?? undefined)
      : src;
    return resolved && isSafeImageUrl(resolved) ? (
      <Box
        component="img"
        src={resolved}
        alt={alt ?? ''}
        sx={{ display: 'block', maxWidth: '100%', borderRadius: 1 }}
      />
    ) : (
      <Typography component="span" variant="caption" color="text.secondary">
        Image unavailable: only HTTPS and bounded PNG/JPEG data images are
        supported.
      </Typography>
    );
  },
  pre: ({ children }) => (
    <Box component="pre" sx={{ m: 0, mb: 1.5, overflow: 'auto' }}>
      {children}
    </Box>
  ),
  table: ({ children }) => (
    <Box sx={{ maxWidth: '100%', overflowX: 'auto', mb: 1.5 }}>
      <Box
        component="table"
        sx={{ borderCollapse: 'collapse', minWidth: '100%' }}
      >
        {children}
      </Box>
    </Box>
  ),
});

export const MarkdownCell: React.FC<MarkdownCellProps> = ({
  cell,
  content,
  attachmentResolver,
  onUpdate,
}) => {
  const value = content ?? cell?.content ?? '';
  const [isEditing, setIsEditing] = useState(!value);
  const lineCount = Math.max(3, value.split('\n').length);
  const editorHeight = Math.min(400, Math.max(80, lineCount * 20 + 18));

  return (
    <Box sx={{ position: 'relative' }}>
      <Box
        sx={{
          position: 'absolute',
          top: 4,
          right: 4,
          zIndex: 2,
        }}
      >
        <IconButton
          size="small"
          onClick={() => setIsEditing((editing) => !editing)}
          aria-label={isEditing ? 'Preview markdown' : 'Edit markdown'}
          aria-pressed={isEditing}
          sx={{ p: 0.25 }}
        >
          {isEditing ? (
            <PreviewIcon sx={{ fontSize: 16 }} />
          ) : (
            <EditIcon sx={{ fontSize: 16 }} />
          )}
        </IconButton>
      </Box>

      {isEditing ? (
        <Box
          component="textarea"
          value={value}
          onChange={(event) => onUpdate(event.target.value)}
          placeholder="Enter markdown content..."
          sx={{
            boxSizing: 'border-box',
            bgcolor: (theme) =>
              theme.palette.mode === 'dark' ? '#121212' : '#fafafa',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            color: (theme) =>
              theme.palette.mode === 'dark' ? '#D4D4D4' : '#000000',
            caretColor: (theme) =>
              theme.palette.mode === 'dark' ? '#AEAFAD' : '#000000',
            display: 'block',
            fontFamily:
              '"Menlo", "Monaco", "Consolas", "Courier New", monospace',
            fontSize: 13,
            height: editorHeight,
            lineHeight: '20px',
            outline: 'none',
            overflow: 'auto',
            px: 2,
            py: 1.5,
            pr: 5,
            resize: 'none',
            width: '100%',
            '&::placeholder': {
              color: 'text.secondary',
              opacity: 1,
            },
            '&:focus': {
              borderColor: 'primary.main',
            },
            '&::selection': {
              bgcolor: (theme) =>
                theme.palette.mode === 'dark' ? '#264F78' : '#ADD6FF',
            },
          }}
        />
      ) : (
        <Paper
          elevation={0}
          sx={{
            px: 2,
            py: 1.5,
            pr: 5,
            bgcolor: (theme) =>
              theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
            border: '1px solid',
            borderColor: 'divider',
            minHeight: 40,
            fontSize: 13,
            lineHeight: 1.5,
            overflowWrap: 'anywhere',
            '& h1, & h2, & h3, & h4, & h5, & h6': {
              lineHeight: 1.25,
              mt: 1.5,
              mb: 0.75,
            },
            '& h1': { fontSize: '1.45rem' },
            '& h2': { fontSize: '1.3rem' },
            '& h3': { fontSize: '1.15rem' },
            '& p': { my: 0.75 },
            '& ul, & ol': { pl: 2.5, my: 0.75 },
            '& input[type="checkbox"]': { pointerEvents: 'none' },
            '& :not(pre) > code': {
              bgcolor: 'action.hover',
              borderRadius: 0.5,
              px: 0.5,
              py: 0.25,
              fontFamily: 'monospace',
            },
            '& pre': {
              bgcolor: 'action.hover',
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
              p: 1,
            },
            '& th, & td': {
              border: 1,
              borderColor: 'divider',
              p: 0.75,
              textAlign: 'left',
              verticalAlign: 'top',
            },
            '& th': { bgcolor: 'action.hover' },
            '& blockquote': {
              borderLeft: 3,
              borderColor: 'primary.main',
              color: 'text.secondary',
              m: 0,
              my: 1,
              pl: 1,
            },
          }}
        >
          {value ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeSanitize, rehypeHighlight]}
              components={createMarkdownComponents(attachmentResolver)}
            >
              {value}
            </ReactMarkdown>
          ) : (
            <Typography
              variant="body2"
              color="text.secondary"
              fontStyle="italic"
              sx={{ fontSize: 11 }}
            >
              Empty markdown cell. Click edit to add content.
            </Typography>
          )}
        </Paper>
      )}
    </Box>
  );
};
