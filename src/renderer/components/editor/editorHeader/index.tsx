import React from 'react';
import {
  Box,
  Button,
  IconButton,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import {
  Save,
  VerticalSplit,
  PlayArrow,
  PreviewOutlined,
} from '@mui/icons-material';
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
  showPreview: boolean;
  onSave: () => void;
  onToggleDiff: () => void;
  onTogglePreview: () => void;
  onNavigate?: (path: string) => void;
  onRun?: () => void;
  extraActions?: React.ReactNode;
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
  showPreview,
  onSave,
  onToggleDiff,
  onTogglePreview,
  onNavigate,
  onRun,
  extraActions,
}) => {
  const isMarkdown =
    filePath.toLowerCase().endsWith('.md') ||
    filePath.toLowerCase().endsWith('.markdown');

  const getDiffTooltip = () => {
    if (showDiffView) return 'Hide Diff';
    if (showDiffButton) return 'Compare Changes';
    return 'No changes to compare';
  };

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
      <Box
        sx={{ display: 'flex', gap: 1, px: 2, py: 0.5, alignItems: 'center' }}
      >
        {/* Extra actions (e.g. AI, Model buttons) */}
        {extraActions}
        {/* Run Button (only shown if onRun is provided, e.g. for Python files) */}
        {onRun && (
          <Tooltip title="Run python script">
            <span>
              <IconButton
                onClick={onRun}
                size="small"
                sx={{ color: 'success.main' }}
              >
                <PlayArrow fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
        {/* Preview Button — only visible for markdown files */}
        {isMarkdown && (
          <Tooltip title={showPreview ? 'Close Preview' : 'Open Preview'}>
            <span>
              <IconButton
                onClick={onTogglePreview}
                size="small"
                sx={{
                  color: showPreview ? 'primary.main' : 'text.secondary',
                  backgroundColor: showPreview
                    ? 'action.selected'
                    : 'transparent',
                  '&:hover': {
                    backgroundColor: showPreview
                      ? 'action.selected'
                      : 'action.hover',
                  },
                }}
              >
                <PreviewOutlined fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
        {/* Diff Button — always visible, disabled when no diff is available */}
        <Tooltip title={getDiffTooltip()}>
          <span>
            <IconButton
              onClick={onToggleDiff}
              disabled={!showDiffButton}
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
                '&.Mui-disabled': {
                  opacity: 0.35,
                },
              }}
            >
              <VerticalSplit fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
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
