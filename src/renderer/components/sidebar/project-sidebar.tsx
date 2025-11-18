import React, { useState } from 'react';
import { Box, useTheme, Tooltip } from '@mui/material';
import { FileTreeViewer } from '../index';
import { FileTreeContainer } from '../../screens/projectDetails/styles';
import { FileStatus, FileNode, Project } from '../../../types/backend';
import { Icon } from '../icon';
import { icons } from '../../../../assets';
import { SourceControlView } from '../sourceControl/SourceControlView';

type SidebarTab = 'explorer' | 'scm';

// Explorer Tab Component - Wraps existing FileTreeViewer
interface ExplorerTabProps {
  directories?: FileNode;
  statuses: FileStatus[];
  isLoadingDirectories: boolean;
  selectedFilePath?: string;
  onDeleteFile: (deletedFile: string) => void;
  onFileSelect: (fileNode: any) => Promise<void>;
  onRefreshFiles: () => Promise<void>;
  onCopyPath: (source: string, target: string) => Promise<void>;
  onNewFile: (filePath?: string) => void;
}

const ExplorerTab: React.FC<ExplorerTabProps> = ({
  directories,
  statuses,
  isLoadingDirectories,
  selectedFilePath,
  onDeleteFile,
  onFileSelect,
  onRefreshFiles,
  onCopyPath,
  onNewFile,
}) => {
  return (
    <FileTreeContainer>
      {directories && (
        <FileTreeViewer
          statuses={statuses}
          node={directories}
          onDeleteFileCallback={onDeleteFile}
          onFileSelect={onFileSelect}
          isLoadingFiles={isLoadingDirectories}
          refreshFiles={onRefreshFiles}
          copyPath={onCopyPath}
          onNewFileCallback={onNewFile}
          selectedPath={selectedFilePath}
        />
      )}
    </FileTreeContainer>
  );
};

// Source Control Tab Component - Monaco Editor Integration
interface SourceControlTabProps {
  projectPath?: string;
  onOpenFile?: (filePath: string) => void;
  onFileSelect?: (filePath: string) => void;
  onRefreshFileContent?: (filePath: string) => void;
}

const SourceControlTab: React.FC<SourceControlTabProps> = ({
  projectPath,
  onOpenFile,
  onFileSelect,
  onRefreshFileContent,
}) => {
  return (
    <SourceControlView
      projectPath={projectPath}
      onOpenFile={onOpenFile}
      onFileSelect={onFileSelect}
      onRefreshFileContent={onRefreshFileContent}
    />
  );
};

interface ProjectSidebarProps {
  // File Explorer props (preserve all existing functionality)
  directories?: FileNode;
  statuses: FileStatus[];
  isLoadingDirectories: boolean;
  selectedFilePath?: string;
  project?: Project;

  // File Explorer callbacks (preserve all existing functionality)
  onDeleteFile: (deletedFile: string) => void;
  onFileSelect: (fileNode: any) => Promise<void>;
  onRefreshFiles: () => Promise<void>;
  onCopyPath: (source: string, target: string) => Promise<void>;
  onNewFile: (filePath?: string) => void;

  // Source Control tab integration with Monaco editor
  onSourceControlOpenFile?: (filePath: string) => void;
  onSourceControlFileSelect?: (filePath: string) => void;
  onSourceControlRefreshFileContent?: (filePath: string) => void;
}

export const ProjectSidebar: React.FC<ProjectSidebarProps> = ({
  directories,
  statuses,
  isLoadingDirectories,
  selectedFilePath,
  project,
  onDeleteFile,
  onFileSelect,
  onRefreshFiles,
  onCopyPath,
  onNewFile,
  onSourceControlOpenFile,
  onSourceControlFileSelect,
  onSourceControlRefreshFileContent,
}) => {
  const [activeTab, setActiveTab] = useState<SidebarTab>('explorer');
  const theme = useTheme();

  return (
    <Box
      sx={{
        height: '100%',
        width: '300px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Simple Horizontal Icon List - Clean Flexbox */}
      <Box
        sx={{
          display: 'flex',
          height: 36,
          backgroundColor: 'background.paper',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
          py: 0.5,
        }}
      >
        {/* Explorer Icon */}
        <Tooltip
          title="Explorer"
          placement="bottom"
          enterDelay={800}
          enterNextDelay={800}
        >
          <Box
            onClick={() => setActiveTab('explorer')}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              cursor: 'pointer',
              borderRadius: 0.5,
              backgroundColor:
                activeTab === 'explorer' ? 'action.selected' : 'transparent',
              opacity: activeTab === 'explorer' ? 1 : 0.7,
              transition: 'all 0.2s ease',
              '&:hover': {
                backgroundColor: 'action.hover',
                opacity: 1,
              },
            }}
          >
            <Icon
              src={icons.folder}
              width={16}
              height={16}
              color={
                activeTab === 'explorer'
                  ? theme.palette.primary.main
                  : theme.palette.text.secondary
              }
            />
          </Box>
        </Tooltip>

        {/* Source Control Icon */}
        <Tooltip
          title="Source Control"
          placement="bottom"
          enterDelay={800}
          enterNextDelay={800}
        >
          <Box
            onClick={() => setActiveTab('scm')}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              cursor: 'pointer',
              borderRadius: 0.5,
              backgroundColor:
                activeTab === 'scm' ? 'action.selected' : 'transparent',
              opacity: activeTab === 'scm' ? 1 : 0.7,
              transition: 'all 0.2s ease',
              '&:hover': {
                backgroundColor: 'action.hover',
                opacity: 1,
              },
            }}
          >
            <Icon
              src={icons.gitBranch}
              width={16}
              height={16}
              color={
                activeTab === 'scm'
                  ? theme.palette.primary.main
                  : theme.palette.text.secondary
              }
            />
          </Box>
        </Tooltip>
      </Box>

      {/* Tab Content */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        {/* File Explorer Tab - Preserve Existing Functionality Exactly */}
        {activeTab === 'explorer' && (
          <ExplorerTab
            directories={directories}
            statuses={statuses}
            isLoadingDirectories={isLoadingDirectories}
            selectedFilePath={selectedFilePath}
            onDeleteFile={onDeleteFile}
            onFileSelect={onFileSelect}
            onRefreshFiles={onRefreshFiles}
            onCopyPath={onCopyPath}
            onNewFile={onNewFile}
          />
        )}

        {/* Source Control Tab - New Git Interface */}
        {activeTab === 'scm' && (
          <SourceControlTab
            projectPath={project?.path}
            onOpenFile={onSourceControlOpenFile}
            onFileSelect={onSourceControlFileSelect}
            onRefreshFileContent={onSourceControlRefreshFileContent}
          />
        )}
      </Box>
    </Box>
  );
};
