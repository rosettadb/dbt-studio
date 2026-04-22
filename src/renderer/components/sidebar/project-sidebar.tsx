import React from 'react';
import { Box } from '@mui/material';
import { FileTreeViewer } from '../index';
import { FileTreeContainer } from '../../screens/projectDetails/styles';
import { FileStatus, FileNode, Project } from '../../../types/backend';
import { SourceControlView } from '../sourceControl';

export type SidebarTab = 'explorer' | 'scm';

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
  onRenameFile?: (oldPath: string, newPath: string) => void;
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
  onRenameFile,
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
          onRenameCallback={onRenameFile}
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
  onSynchronize?: () => Promise<void>;
  isSynchronizing?: boolean;
}

const SourceControlTab: React.FC<SourceControlTabProps> = ({
  projectPath,
  onOpenFile,
  onFileSelect,
  onRefreshFileContent,
  onSynchronize,
  isSynchronizing,
}) => {
  return (
    <SourceControlView
      projectPath={projectPath}
      onOpenFile={onOpenFile}
      onFileSelect={onFileSelect}
      onRefreshFileContent={onRefreshFileContent}
      onSynchronize={onSynchronize}
      isSynchronizing={isSynchronizing}
    />
  );
};

interface ProjectSidebarProps {
  // Tab control (lifted to parent)
  activeTab: SidebarTab;

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
  onRenameFile?: (oldPath: string, newPath: string) => void;

  // Source Control tab integration with Monaco editor
  onSourceControlOpenFile?: (filePath: string) => void;
  onSourceControlFileSelect?: (filePath: string) => void;
  onSourceControlRefreshFileContent?: (filePath: string) => void;

  // Synchronization
  onSourceControlSynchronize?: () => Promise<void>;
  isSourceControlSynchronizing?: boolean;
}

export const ProjectSidebar: React.FC<ProjectSidebarProps> = ({
  activeTab,
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
  onRenameFile,
  onSourceControlOpenFile,
  onSourceControlFileSelect,
  onSourceControlRefreshFileContent,
  onSourceControlSynchronize,
  isSourceControlSynchronizing,
}) => {
  return (
    <Box
      sx={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
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
            onRenameFile={onRenameFile}
          />
        )}

        {/* Source Control Tab - New Git Interface */}
        {activeTab === 'scm' && (
          <SourceControlTab
            projectPath={project?.path}
            onOpenFile={onSourceControlOpenFile}
            onFileSelect={onSourceControlFileSelect}
            onRefreshFileContent={onSourceControlRefreshFileContent}
            onSynchronize={onSourceControlSynchronize}
            isSynchronizing={isSourceControlSynchronizing}
          />
        )}
      </Box>
    </Box>
  );
};
