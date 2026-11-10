import React from 'react';
import { Container } from './styles';
import { FileNode, FileStatus } from '../../../types/backend';
import { NewFileModal } from '../modals';
import { useGetSelectedProject, useGetSettings } from '../../controllers';
import { ArboristTree } from './ArboristTree';
import { FileStatuses } from './types';

type Props = {
  node: FileNode;
  onFileSelect: (file: FileNode) => void;
  refreshFiles: () => void;
  onDeleteFileCallback: (filePath: string) => void;
  onNewFileCallback: (filePath?: string) => void;
  statuses: FileStatus[];
  copyPath: (source: string, target: string) => Promise<void>;
  selectedPath?: string;
  onRenameCallback?: (oldPath: string, newPath: string) => void;
  onRunPipeline?: (filePath: string) => void;
  onRunPipelineLocal?: (filePath: string) => void;
  revealFolderPath?: string | null;
  onFolderRevealed?: () => void;
};

const FileTreeViewer: React.FC<Props> = ({
  node,
  onFileSelect,
  refreshFiles,
  onDeleteFileCallback,
  onNewFileCallback,
  statuses,
  copyPath,
  selectedPath,
  onRenameCallback,
  onRunPipeline,
  onRunPipelineLocal,
  revealFolderPath,
  onFolderRevealed,
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
        revealFolderPath={revealFolderPath}
        onFolderRevealed={onFolderRevealed}
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
