import React from 'react';
import { CircularProgress, Tooltip, Box } from '@mui/material';
import { Cached } from '@mui/icons-material';
import { Container } from './styles';
import { FileNode, FileStatus } from '../../../types/backend';
import { NewFileModal } from '../modals';
import { useGetSelectedProject, useGetSettings } from '../../controllers';
import { ArboristTree } from './ArboristTree';
import { FileStatuses } from './types';

type Props = {
  node: FileNode;
  onFileSelect: (file: FileNode) => void;
  isLoadingFiles: boolean;
  refreshFiles: () => void;
  onDeleteFileCallback: (filePath: string) => void;
  onNewFileCallback: (filePath?: string) => void;
  statuses: FileStatus[];
  copyPath: (source: string, target: string) => Promise<void>;
  selectedPath?: string;
  onRenameCallback?: (oldPath: string, newPath: string) => void;
  onRunPipeline?: (filePath: string) => void;
  onRunPipelineLocal?: (filePath: string) => void;
};

const FileTreeViewer: React.FC<Props> = ({
  node,
  onFileSelect,
  isLoadingFiles,
  refreshFiles,
  onDeleteFileCallback,
  onNewFileCallback,
  statuses,
  copyPath,
  selectedPath,
  onRenameCallback,
  onRunPipeline,
  onRunPipelineLocal,
}) => {
  const { data: project } = useGetSelectedProject();
  const { data: settings } = useGetSettings();

  const [fileModal, setFileModal] = React.useState<string>();
  const [folderModal, setFolderModal] = React.useState<string>();
  const [fileStatuses, setFileStatuses] = React.useState<FileStatuses>({});

  React.useEffect(() => {
    if (!project?.path) return;
    const statusMap: FileStatuses = {};
    statuses.forEach((status) => {
      statusMap[status.path] = status.status as any;
    });
    setFileStatuses(statusMap);
  }, [project, statuses]);

  if (!project) return null;

  return (
    <Container>
      <Box
        paddingX={0.5}
        display="flex"
        sx={{ alignItems: 'center', justifyContent: 'flex-end', mb: 1 }}
      >
        <Tooltip title="Refresh directories">
          {isLoadingFiles ? (
            <CircularProgress size={20} />
          ) : (
            <Cached
              sx={{ color: 'primary.main', cursor: 'pointer' }}
              onClick={() => refreshFiles()}
            />
          )}
        </Tooltip>
      </Box>

      <ArboristTree
        data={node}
        fileStatuses={fileStatuses}
        onFileSelect={onFileSelect}
        onRefresh={refreshFiles}
        onCreateFile={(path) => setFileModal(path)}
        onCreateFolder={(path) => setFolderModal(path)}
        onDeleteSuccess={onDeleteFileCallback}
        onRenameSuccess={onRenameCallback}
        selectedPath={selectedPath}
        projectPath={project.path}
        copyPath={copyPath}
        onRunPipeline={
          settings?.env === 'cloud' && !settings?.dbtVersion?.startsWith('2.')
            ? onRunPipeline
            : undefined
        }
        onRunPipelineLocal={
          settings?.env !== 'cloud' &&
          !settings?.dbtVersion?.startsWith('2.') &&
          settings?.runnerPath
            ? onRunPipelineLocal
            : undefined
        }
      />
      {(fileModal || folderModal) && (
        <NewFileModal
          isOpen={!!folderModal || !!fileModal}
          onClose={() =>
            fileModal ? setFileModal(undefined) : setFolderModal(undefined)
          }
          type={fileModal ? 'file' : 'folder'}
          path={String(fileModal ?? folderModal)}
          successCallback={(filePath) => {
            setFileModal(undefined);
            setFolderModal(undefined);
            onNewFileCallback(filePath);
            refreshFiles();
          }}
        />
      )}
    </Container>
  );
};

export { FileTreeViewer };
