/**
 * Markdown Cell Component
 * Simple textarea for markdown content (rich editor can be added later)
 */

import React, { useState } from 'react';
import { Box, TextField, Typography, Paper, IconButton } from '@mui/material';
import {
  Edit as EditIcon,
  Visibility as PreviewIcon,
} from '@mui/icons-material';
import { NotebookCell } from '../../../../types/notebooks';

interface MarkdownCellProps {
  cell: NotebookCell;
  onUpdate: (content: string) => void;
}

export const MarkdownCell: React.FC<MarkdownCellProps> = ({
  cell,
  onUpdate,
}) => {
  const [isEditing, setIsEditing] = useState(!cell.content);

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdate(event.target.value);
  };

  const toggleMode = () => {
    setIsEditing(!isEditing);
  };

  return (
    <Box>
      {/* Mode Toggle */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 0.5 }}>
        <IconButton size="small" onClick={toggleMode} sx={{ p: 0.25 }}>
          {isEditing ? (
            <PreviewIcon sx={{ fontSize: 16 }} />
          ) : (
            <EditIcon sx={{ fontSize: 16 }} />
          )}
        </IconButton>
      </Box>

      {/* Edit Mode */}
      {isEditing ? (
        <TextField
          multiline
          fullWidth
          minRows={3}
          maxRows={20}
          value={cell.content}
          onChange={handleChange}
          placeholder="Enter markdown content..."
          variant="outlined"
          sx={{
            '& .MuiInputBase-root': {
              fontFamily: 'monospace',
              fontSize: 12,
              padding: '6px 8px',
            },
            '& .MuiInputBase-input': {
              padding: 0,
            },
          }}
        />
      ) : (
        /* Preview Mode */
        <Paper
          elevation={0}
          sx={{
            p: 1,
            bgcolor: 'grey.50',
            border: '1px solid',
            borderColor: 'divider',
            minHeight: 40,
          }}
        >
          {cell.content ? (
            <Typography
              variant="body2"
              component="div"
              sx={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: 12,
                lineHeight: 1.5,
                '& h1': { fontSize: '1.25rem', fontWeight: 'bold', mb: 0.5 },
                '& h2': { fontSize: '1.1rem', fontWeight: 'bold', mb: 0.5 },
                '& h3': { fontSize: '1rem', fontWeight: 'bold', mb: 0.5 },
                '& p': { mb: 0.5 },
                '& ul, & ol': { pl: 2, mb: 0.5 },
                '& code': {
                  bgcolor: 'grey.200',
                  px: 0.5,
                  py: 0.25,
                  borderRadius: 0.5,
                  fontFamily: 'monospace',
                  fontSize: '0.9em',
                },
              }}
            >
              {/* Simple markdown rendering - can be enhanced with a proper markdown library */}
              {cell.content.split('\n').map((line, index) => {
                // Headers
                if (line.startsWith('### ')) {
                  return (
                    <Typography key={index} variant="h3">
                      {line.slice(4)}
                    </Typography>
                  );
                }
                if (line.startsWith('## ')) {
                  return (
                    <Typography key={index} variant="h2">
                      {line.slice(3)}
                    </Typography>
                  );
                }
                if (line.startsWith('# ')) {
                  return (
                    <Typography key={index} variant="h1">
                      {line.slice(2)}
                    </Typography>
                  );
                }
                // Lists
                if (line.startsWith('- ') || line.startsWith('* ')) {
                  return <li key={index}>{line.slice(2)}</li>;
                }
                // Regular text
                return <p key={index}>{line || '\u00A0'}</p>;
              })}
            </Typography>
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
