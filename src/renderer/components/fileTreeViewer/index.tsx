import React from 'react';
import {
  CircularProgress,
  Tooltip,
  TextField,
  Box,
  IconButton,
  InputAdornment,
} from '@mui/material';
import { Cached, Clear } from '@mui/icons-material';
import { Container } from './styles';
import { FileNode, FileStatus } from '../../../types/backend';
import { NewFileModal } from '../modals';
import { useGetSelectedProject } from '../../controllers';
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
};

const filterTreeAndCollectExpanded = (
  node: FileNode,
  keyword: string,
): { filtered: FileNode | null; expanded: string[] } => {
  const lowerKeyword = keyword.toLowerCase();
  let expandedPaths: string[] = [];

  const matches = node.path.toLowerCase().includes(lowerKeyword);

  if (node.type === 'folder' && node.children) {
    const filteredChildren = node.children
      .map((child) => filterTreeAndCollectExpanded(child, keyword))
      .filter((result) => result.filtered !== null);

    if (filteredChildren.length > 0) {
      const childrenFiltered = filteredChildren.map(
        (r) => r.filtered!,
      ) as FileNode[];
      filteredChildren.forEach((r) => {
        expandedPaths = [...expandedPaths, ...r.expanded];
      });
      return {
        filtered: { ...node, children: childrenFiltered },
        expanded: [node.path, ...expandedPaths],
      };
    }
  }

  return {
    filtered: matches ? node : null,
    expanded: [],
  };
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
}) => {
  const { data: project } = useGetSelectedProject();
  const [fileModal, setFileModal] = React.useState<string>();
  const [folderModal, setFolderModal] = React.useState<string>();
  const [searchKeyword, setSearchKeyword] = React.useState('');
  const [filteredNode, setFilteredNode] = React.useState<FileNode>(node);
  const [fileStatuses, setFileStatuses] = React.useState<FileStatuses>({});

  const prevNodeRef = React.useRef<FileNode>();

  React.useEffect(() => {
    setFilteredNode(node);
    prevNodeRef.current = node;
  }, [node]);

  React.useEffect(() => {
    if (!project?.path) return;
    const statusMap: FileStatuses = {};
    statuses.forEach((status) => {
      statusMap[status.path] = status.status as any;
    });
    setFileStatuses(statusMap);
  }, [project, statuses]);

  React.useEffect(() => {
    if (!searchKeyword) {
      setFilteredNode(node);
      return;
    }

    const timeout = setTimeout(() => {
      const { filtered } = filterTreeAndCollectExpanded(node, searchKeyword);
      setFilteredNode(filtered || { ...node, children: [] });
    }, 300);

    // eslint-disable-next-line consistent-return
    return () => clearTimeout(timeout);
  }, [searchKeyword, node]);

  return (
    <Container>
      <Box
        paddingX={0.5}
        display="flex"
        sx={{ alignItems: 'center', mb: 1, gap: 1 }}
      >
        <TextField
          fullWidth
          size="small"
          placeholder="Search files or folders..."
          onChange={(e) => setSearchKeyword(e.target.value)}
          value={searchKeyword}
          sx={{
            '& .MuiInputBase-root': { height: 36, fontSize: 13 },
            '& .MuiInputBase-input': { py: 0, px: 1, fontSize: 13 },
          }}
          InputProps={{
            endAdornment: searchKeyword ? (
              <InputAdornment position="end">
                <Tooltip title="Clear search">
                  <IconButton
                    size="small"
                    aria-label="Clear search"
                    onClick={() => setSearchKeyword('')}
                    edge="end"
                  >
                    <Clear fontSize="small" />
                  </IconButton>
                </Tooltip>
              </InputAdornment>
            ) : null,
          }}
        />
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
        data={filteredNode}
        fileStatuses={fileStatuses}
        onFileSelect={onFileSelect}
        onRefresh={refreshFiles}
        onCreateFile={(path) => setFileModal(path)}
        onCreateFolder={(path) => setFolderModal(path)}
        onDeleteSuccess={onDeleteFileCallback}
        onRenameSuccess={onRenameCallback}
        selectedPath={selectedPath}
        projectPath={project!.path}
        copyPath={copyPath}
        onRunPipeline={onRunPipeline}
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
