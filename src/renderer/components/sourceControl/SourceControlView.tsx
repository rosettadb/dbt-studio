import React from 'react';
import { Box } from '@mui/material';
import { RepositoryHeader } from './RepositoryHeader';
import { TipTapCommitInput } from './TipTapCommitInput';
import { useGitIsInitialized, useGetFileStatuses } from '../../controllers';

interface SourceControlViewProps {
  projectPath?: string;
}

export const SourceControlView: React.FC<SourceControlViewProps> = ({
  projectPath,
}) => {
  const { data: isInitialized } = useGitIsInitialized(projectPath || '', {
    enabled: !!projectPath,
  });

  const { data: fileStatuses = [], refetch: refetchStatuses } =
    useGetFileStatuses(projectPath || '', {
      enabled: !!projectPath && !!isInitialized,
    });

  const stagedFilesCount = fileStatuses.filter(
    (f) => f.status === 'staged',
  ).length;

  const handleRefresh = () => {
    refetchStatuses();
  };

  if (!projectPath) {
    return (
      <Box
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '200px',
          color: 'text.secondary',
        }}
      >
        No project selected
      </Box>
    );
  }

  if (!isInitialized) {
    return (
      <Box
        sx={{
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '200px',
          color: 'text.secondary',
          textAlign: 'center',
        }}
      >
        <Box sx={{ mb: 2 }}>Git repository not initialized</Box>
        <Box sx={{ fontSize: '12px', opacity: 0.7 }}>
          Initialize git from the menu to enable source control features
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Repository Header with Actions */}
      <RepositoryHeader projectPath={projectPath} onRefresh={handleRefresh} />

      {/* TipTap Commit Input */}
      <TipTapCommitInput
        projectPath={projectPath}
        stagedFilesCount={stagedFilesCount}
        onCommitSuccess={handleRefresh}
      />

      {/* Content Area - Ready for Changes List */}
      <Box
        sx={{
          flex: 1,
          px: 1.5,
          py: 0.75,
          color: 'text.secondary',
          fontSize: '12px',
        }}
      >
        Changes list will be here (Phase 3 continuation)
      </Box>
    </Box>
  );
};
