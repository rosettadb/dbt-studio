import React from 'react';
import {
  Box,
  Button,
  IconButton,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import { Save, VerticalSplit } from '@mui/icons-material';
import { Breadcrumbs } from '../breadcrumbs';

interface EditorHeaderProps {
  filePath: string;
  projectPath: string;
  isModified: boolean;
  isSaving: boolean;
  hasError: boolean;
  errorMessage?: string;
  showDiffButton: boolean;
  showDiffView: boolean;
  onSave: () => void;
  onToggleDiff: () => void;
  onNavigate?: (path: string) => void;
}

export const EditorHeader: React.FC<EditorHeaderProps> = ({
  filePath,
  projectPath,
  isModified,
  isSaving,
  hasError,
  errorMessage,
  showDiffButton,
  showDiffView,
  onSave,
  onToggleDiff,
  onNavigate,
}) => {
  const getSaveTooltip = () => {
    if (hasError) return errorMessage || 'Error saving file';
    if (isSaving) return 'Saving...';
    if (!isModified) return 'No changes to save';
    return 'Save (⌘S)';
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      {/* Left: Breadcrumbs */}
      <Breadcrumbs
        filePath={filePath}
        projectPath={projectPath}
        onNavigate={onNavigate}
      />

      {/* Right: Action Buttons */}
      <Box sx={{ display: 'flex', gap: 1, px: 2, py: 0.5 }}>
        {/* Diff Button */}
        {showDiffButton && (
          <Tooltip title={showDiffView ? 'Hide Diff' : 'Compare Changes'}>
            <IconButton
              onClick={onToggleDiff}
              size="small"
              sx={{
                color: showDiffView ? 'primary.main' : 'text.secondary',
                backgroundColor: showDiffView
                  ? 'action.selected'
                  : 'transparent',
                '&:hover': {
                  backgroundColor: showDiffView
                    ? 'action.selected'
                    : 'action.hover',
                },
              }}
            >
              <VerticalSplit fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {/* Save Button */}
        <Tooltip title={getSaveTooltip()}>
          <span>
            <Button
              onClick={onSave}
              disabled={!isModified || isSaving}
              variant="contained"
              size="small"
              startIcon={
                isSaving ? (
                  <CircularProgress size={14} color="inherit" />
                ) : (
                  <Save sx={{ fontSize: 16 }} />
                )
              }
              sx={{
                textTransform: 'none',
                minWidth: 'auto',
                px: 1.5,
                py: 0.25,
                fontSize: '0.8125rem',
              }}
            >
              Save
            </Button>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
};
