import React from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import { Add, Remove, Undo } from '@mui/icons-material';
import { CollapsibleSection } from './CollapsibleSection';
import { FileItem } from './FileItem';
import { FileStatus } from '../../../types/backend';

interface ChangesSectionProps {
  fileStatuses: FileStatus[];
  onStage?: (filePath: string) => void;
  onUnstage?: (filePath: string) => void;
  onStageAll?: () => void;
  onUnstageAll?: () => void;
  onDiscard?: (filePath: string) => void;
  onDiscardAll?: () => void;
  onOpenFile?: (filePath: string) => void;
}

export const ChangesSection: React.FC<ChangesSectionProps> = ({
  fileStatuses,
  onStage,
  onUnstage,
  onStageAll,
  onUnstageAll,
  onDiscard,
  onDiscardAll,
  onOpenFile,
}) => {
  // Filter files by staged status
  const stagedFiles = fileStatuses.filter(
    (file: FileStatus) => file.status === 'staged',
  );
  const unstagedFiles = fileStatuses.filter(
    (file: FileStatus) => file.status !== 'staged',
  );

  // Bulk action buttons
  const stagedActions = (
    <Tooltip title="Unstage All Changes" placement="top" enterDelay={500}>
      <IconButton
        size="small"
        onClick={onUnstageAll}
        disabled={stagedFiles.length === 0}
        sx={{
          width: 20,
          height: 20,
          color: 'text.secondary',
          '&:hover': {
            backgroundColor: 'action.hover',
            color: 'error.main',
          },
          '&.Mui-disabled': {
            color: 'text.disabled',
          },
        }}
      >
        <Remove sx={{ fontSize: 14 }} />
      </IconButton>
    </Tooltip>
  );

  const unstagedActions = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
      {/* Discard All Changes Button */}
      <Tooltip title="Discard All Changes" placement="top" enterDelay={500}>
        <IconButton
          size="small"
          onClick={onDiscardAll}
          disabled={unstagedFiles.length === 0}
          sx={{
            width: 20,
            height: 20,
            color: 'text.secondary',
            '&:hover': {
              backgroundColor: 'action.hover',
              color: 'warning.main',
            },
            '&.Mui-disabled': {
              color: 'text.disabled',
            },
          }}
        >
          <Undo sx={{ fontSize: 14 }} />
        </IconButton>
      </Tooltip>

      {/* Stage All Changes Button */}
      <Tooltip title="Stage All Changes" placement="top" enterDelay={500}>
        <IconButton
          size="small"
          onClick={onStageAll}
          disabled={unstagedFiles.length === 0}
          sx={{
            width: 20,
            height: 20,
            color: 'text.secondary',
            '&:hover': {
              backgroundColor: 'action.hover',
              color: 'success.main',
            },
            '&.Mui-disabled': {
              color: 'text.disabled',
            },
          }}
        >
          <Add sx={{ fontSize: 14 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );

  return (
    <Box sx={{ flex: 1, overflow: 'auto' }}>
      {/* Staged Changes Section - Always show (matches VSCode behavior) */}
      <CollapsibleSection
        title="Staged Changes"
        count={stagedFiles.length}
        defaultExpanded
        actions={stagedActions}
      >
        {stagedFiles.map((file: FileStatus) => (
          <FileItem
            key={file.path}
            file={file}
            onStage={onStage}
            onUnstage={onUnstage}
            onDiscard={onDiscard}
            onOpenFile={onOpenFile}
          />
        ))}
      </CollapsibleSection>

      {/* Unstaged Changes Section - Always show */}
      <CollapsibleSection
        title="Changes"
        count={unstagedFiles.length}
        defaultExpanded
        actions={unstagedActions}
      >
        {unstagedFiles.map((file: FileStatus) => (
          <FileItem
            key={file.path}
            file={file}
            onStage={onStage}
            onUnstage={onUnstage}
            onDiscard={onDiscard}
            onOpenFile={onOpenFile}
          />
        ))}
      </CollapsibleSection>

      {/* No Changes State - Only when no files at all */}
      {fileStatuses.length === 0 && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100px',
            color: 'text.secondary',
            fontSize: '12px',
            fontStyle: 'italic',
          }}
        >
          No changes detected
        </Box>
      )}
    </Box>
  );
};
