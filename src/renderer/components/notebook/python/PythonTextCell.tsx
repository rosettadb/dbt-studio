/**
 * Python Notebook Text Cell (markdown)
 * Edit mode is a plain textarea with a Colab-style formatting toolbar that
 * inserts markdown syntax; Shift+Enter (or blur) renders the markdown with
 * react-markdown + GFM. Double-click the preview to edit again.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, TextField, Typography, useTheme } from '@mui/material';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MarkdownToolbar } from './MarkdownToolbar';
import {
  applyMarkdownFormat,
  MarkdownFormatAction,
} from './markdownFormatting';

/** Keyboard shortcuts (⌘ / Ctrl + key) mapped to toolbar actions. */
const SHORTCUTS: Record<string, MarkdownFormatAction> = {
  b: 'bold',
  i: 'italic',
  k: 'link',
};

interface PythonTextCellProps {
  source: string;
  onChange: (source: string) => void;
  onRender: () => void;
  onFocus: () => void;
  /** Start in edit mode (new empty cells) */
  startEditing?: boolean;
  focusRequest?: number;
  /** Increment to leave edit mode and show the rendered markdown */
  renderRequest?: number;
  /** Increment to leave the preview and show the raw markdown for editing */
  editRequest?: number;
  onEditingChange?: (editing: boolean) => void;
}

export const PythonTextCell: React.FC<PythonTextCellProps> = ({
  source,
  onChange,
  onRender,
  onFocus,
  startEditing,
  focusRequest,
  renderRequest,
  editRequest,
  onEditingChange,
}) => {
  const theme = useTheme();
  const [isEditing, setIsEditing] = useState(Boolean(startEditing) || !source);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (focusRequest) {
      setIsEditing(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [focusRequest]);

  useEffect(() => {
    if (renderRequest) setIsEditing(false);
  }, [renderRequest]);

  useEffect(() => {
    if (editRequest) {
      setIsEditing(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [editRequest]);

  useEffect(() => {
    onEditingChange?.(isEditing);
  }, [isEditing, onEditingChange]);

  // Apply a toolbar / shortcut action to the textarea selection, then restore
  // the caret once React has re-rendered the new value.
  const handleFormat = useCallback(
    (action: MarkdownFormatAction) => {
      const input = inputRef.current;
      if (!input) return;
      const result = applyMarkdownFormat(
        source,
        input.selectionStart ?? source.length,
        input.selectionEnd ?? source.length,
        action,
      );
      onChange(result.source);
      requestAnimationFrame(() => {
        input.focus();
        input.setSelectionRange(result.selectionStart, result.selectionEnd);
      });
    },
    [source, onChange],
  );

  if (isEditing) {
    return (
      <Box>
        <MarkdownToolbar onFormat={handleFormat} />
        <TextField
          inputRef={inputRef}
          multiline
          fullWidth
          minRows={2}
          autoFocus={Boolean(startEditing)}
          value={source}
          placeholder="Type markdown here…"
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={() => {
            if (source.trim()) setIsEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.shiftKey) {
              e.preventDefault();
              setIsEditing(false);
              onRender();
              return;
            }
            const shortcut = SHORTCUTS[e.key.toLowerCase()];
            if (shortcut && (e.metaKey || e.ctrlKey) && !e.altKey) {
              e.preventDefault();
              handleFormat(shortcut);
            }
          }}
          variant="standard"
          InputProps={{ disableUnderline: true }}
          sx={{
            px: 1.5,
            py: 1,
            '& .MuiInputBase-root': {
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 13,
              lineHeight: 1.6,
            },
          }}
        />
      </Box>
    );
  }

  return (
    <Box
      onDoubleClick={() => setIsEditing(true)}
      onClick={onFocus}
      role="presentation"
      sx={{
        px: 2,
        py: 1,
        cursor: 'text',
        fontSize: 14,
        lineHeight: 1.6,
        '& > *:first-of-type': { mt: 0 },
        '& > *:last-child': { mb: 0 },
        '& h1': { fontSize: '1.5rem', mt: 1, mb: 0.5 },
        '& h2': { fontSize: '1.25rem', mt: 1, mb: 0.5 },
        '& h3': { fontSize: '1.1rem', mt: 1, mb: 0.5 },
        '& p': { my: 0.5 },
        '& ul, & ol': { pl: 3, my: 0.5 },
        '& code': {
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '0.9em',
          bgcolor:
            theme.palette.mode === 'dark'
              ? 'rgba(255,255,255,0.08)'
              : 'rgba(0,0,0,0.06)',
          px: 0.5,
          borderRadius: 0.5,
        },
        '& pre': {
          bgcolor:
            theme.palette.mode === 'dark'
              ? 'rgba(255,255,255,0.06)'
              : 'rgba(0,0,0,0.04)',
          p: 1,
          borderRadius: 1,
          overflowX: 'auto',
        },
        '& pre code': { bgcolor: 'transparent', px: 0 },
        '& table': { borderCollapse: 'collapse', my: 1 },
        '& th, & td': {
          border: '1px solid',
          borderColor: 'divider',
          px: 1,
          py: 0.25,
        },
        '& blockquote': {
          borderLeft: '3px solid',
          borderColor: 'divider',
          ml: 0,
          pl: 1.5,
          color: 'text.secondary',
        },
        '& a': { color: 'primary.main' },
      }}
    >
      {source.trim() ? (
        <Markdown remarkPlugins={[remarkGfm]}>{source}</Markdown>
      ) : (
        <Typography variant="body2" color="text.secondary" fontStyle="italic">
          Empty text cell. Double-click to edit.
        </Typography>
      )}
    </Box>
  );
};

export default PythonTextCell;
