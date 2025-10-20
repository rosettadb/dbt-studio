import React, { useState } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  Add as AddIcon,
  Close as CloseIcon,
  AttachFile as PaperclipIcon,
} from '@mui/icons-material';
import { useSelectedFileContext } from '../../hooks/useSelectedFileContext';
import { useContextManager } from '../../hooks/useContextManager';
import { FilePickerModal } from './FilePickerModal';

interface ContextFile {
  path: string;
  name: string;
  relativePath: string;
  fileType: string;
}

interface ContextTabsProps {
  contextManager: ReturnType<typeof useContextManager>;
  onAddSelectedFile?: () => void;
}

export const ContextTabs: React.FC<ContextTabsProps> = ({
  contextManager,
  onAddSelectedFile,
}) => {
  const theme = useTheme();
  const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
  const { hasSelectedFile, selectedFileName, selectedFileContext } =
    useSelectedFileContext();

  const handleAddSelectedFile = () => {
    if (
      hasSelectedFile &&
      selectedFileContext &&
      !contextManager.isFileInContext(selectedFileContext.metadata?.path)
    ) {
      // Add selected file to context
      const contextFile: ContextFile = {
        path: selectedFileContext.metadata?.path || '',
        name: selectedFileName || '',
        relativePath:
          selectedFileContext.metadata?.relativePath || selectedFileName || '',
        fileType: selectedFileContext.metadata?.fileType || 'other',
      };

      contextManager.addFiles([contextFile]);
      onAddSelectedFile?.();
    }
  };

  const handleRemoveFile = (filePath: string) => {
    contextManager.removeFile(filePath);
  };

  const handleAddFiles = (selectedFiles: any[]) => {
    // Get currently selected file paths from the modal
    const selectedPaths = selectedFiles.map((file) => file.path);

    // Get currently active context file paths
    const currentPaths = contextManager.additionalFiles.map((f) => f.path);

    // Find files to add (selected but not in current context)
    const filesToAdd = selectedFiles.filter(
      (file) => !currentPaths.includes(file.path),
    );

    // Find files to remove (in current context but not selected)
    const filesToRemove = currentPaths.filter(
      (path) => !selectedPaths.includes(path),
    );

    // Add new files
    if (filesToAdd.length > 0) {
      const contextFiles: ContextFile[] = filesToAdd.map((file) => ({
        path: file.path,
        name: file.name,
        relativePath: file.relativePath,
        fileType: file.fileType || 'other',
      }));
      contextManager.addFiles(contextFiles);
    }

    // Remove unselected files
    filesToRemove.forEach((filePath) => {
      contextManager.removeFile(filePath);
    });

    setIsFilePickerOpen(false);
  };

  // Get files to exclude from selection (already in context)
  const excludeFiles = React.useMemo(() => {
    const excluded: string[] = [];

    // Add additional files paths (they're already selected)
    excluded.push(...contextManager.additionalFiles.map((f) => f.path));

    // Add selected file path if it's already in context
    if (
      hasSelectedFile &&
      selectedFileContext?.metadata?.path &&
      contextManager.isFileInContext(selectedFileContext.metadata.path)
    ) {
      excluded.push(selectedFileContext.metadata.path);
    }

    return excluded;
  }, [
    contextManager.additionalFiles,
    hasSelectedFile,
    selectedFileContext,
    contextManager,
  ]);

  return (
    <Box
      sx={{
        px: 1,
        pt: 0.5,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 0.5,
        alignItems: 'center',
        minHeight: 28,
      }}
    >
      {/* 1. Add context paperclip icon - GitHub Copilot style - ALWAYS FIRST */}
      <Tooltip
        title="Add context..."
        placement="top"
        arrow
        enterDelay={500}
        enterNextDelay={500}
      >
        <IconButton
          size="small"
          onClick={() => setIsFilePickerOpen(true)}
          sx={{
            width: 20,
            height: 20,
            color: 'text.secondary',
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 0.5,
            '&:hover': {
              color: 'text.primary',
              backgroundColor: theme.palette.action.hover,
              borderColor: theme.palette.text.secondary,
            },
          }}
        >
          <PaperclipIcon sx={{ fontSize: '0.8rem' }} />
        </IconButton>
      </Tooltip>

      {/* 2. Selected file tab - ALWAYS SECOND (if exists) */}
      {hasSelectedFile && selectedFileContext && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            px: 0.5,
            py: 0.1,
            borderRadius: 0.5,
            border: contextManager.isFileInContext(
              selectedFileContext.metadata?.path,
            )
              ? `1px solid ${theme.palette.divider}`
              : '1px dotted',
            borderColor: theme.palette.divider,
            fontSize: '0.65rem',
            color: contextManager.isFileInContext(
              selectedFileContext.metadata?.path,
            )
              ? 'text.primary'
              : 'text.secondary',
            '&:hover': {
              backgroundColor: theme.palette.action.hover,
            },
          }}
        >
          <Box component="span" sx={{ fontSize: '0.65rem' }}>
            {selectedFileName}
          </Box>
          {contextManager.isFileInContext(
            selectedFileContext.metadata?.path,
          ) ? (
            // Remove button if file is in context
            <IconButton
              size="small"
              onClick={() =>
                handleRemoveFile(selectedFileContext.metadata?.path || '')
              }
              sx={{
                width: 16,
                height: 16,
                ml: 0.5,
                color: 'text.secondary',
                '&:hover': {
                  color: 'text.primary',
                  backgroundColor: theme.palette.action.hover,
                },
              }}
            >
              <CloseIcon sx={{ fontSize: '0.7rem' }} />
            </IconButton>
          ) : (
            // Add button if file is not in context
            <Tooltip title="Enable current file context" placement="top" arrow>
              <IconButton
                size="small"
                onClick={handleAddSelectedFile}
                sx={{
                  width: 16,
                  height: 16,
                  ml: 0.5,
                  color: 'text.secondary',
                  '&:hover': {
                    color: 'primary.main',
                    backgroundColor: theme.palette.action.hover,
                  },
                }}
              >
                <AddIcon sx={{ fontSize: '0.7rem' }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )}

      {/* 3. Additional context files - THIRD */}
      {contextManager.additionalFiles
        .filter(
          (file) =>
            // Don't show the selected file again if it's already in additional files
            !hasSelectedFile ||
            !selectedFileContext?.metadata?.path ||
            file.path !== selectedFileContext.metadata.path,
        )
        .map((file) => {
          return (
            <Box
              key={file.path}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                px: 0.5,
                py: 0.1,
                borderRadius: 0.5,
                border: `1px solid ${theme.palette.divider}`,
                fontSize: '0.65rem',
                color: 'text.primary',
                '&:hover': {
                  backgroundColor: theme.palette.action.selected,
                },
              }}
            >
              <Box component="span" sx={{ fontSize: '0.65rem' }}>
                {file.name}
              </Box>
              <IconButton
                size="small"
                onClick={() => handleRemoveFile(file.path)}
                sx={{
                  width: 16,
                  height: 16,
                  ml: 0.5,
                  color: 'text.secondary',
                  '&:hover': {
                    color: 'text.primary',
                    backgroundColor: theme.palette.action.hover,
                  },
                }}
              >
                <CloseIcon sx={{ fontSize: '0.7rem' }} />
              </IconButton>
            </Box>
          );
        })}

      {/* File Picker Modal */}
      <FilePickerModal
        open={isFilePickerOpen}
        onClose={() => setIsFilePickerOpen(false)}
        onSelect={handleAddFiles}
        selectedFiles={contextManager.additionalFiles.map((f) => f.path)}
        excludeFiles={excludeFiles}
      />
    </Box>
  );
};
