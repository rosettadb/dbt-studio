import React from 'react';
import { CircularProgress, Tooltip, TextField, Box } from '@mui/material';
import { Cached } from '@mui/icons-material';
import { RenderTree } from './RenderTree';
import { Container, Header, StyledTreeView } from './styles';
import { FileNode, FileStatus } from '../../../types/backend';
import { ConfirmationModal, NewFileModal } from '../modals';
import { projectsServices } from '../../services';
import { useGetSelectedProject } from '../../controllers';

type Props = {
  node: FileNode;
  onFileSelect: (file: FileNode) => void;
  isLoadingFiles: boolean;
  refreshFiles: () => void;
  onDbtRun: (file: FileNode) => Promise<void>;
  onDbtTest: (file: FileNode) => Promise<void>;
  onDeleteFileCallback: (filePath: string) => void;
  statuses: FileStatus[];
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
  onDbtRun,
  onDbtTest,
  onDeleteFileCallback,
  statuses,
}) => {
  const { data: project } = useGetSelectedProject();
  const [expandedItems, setExpandedItems] = React.useState<string[]>([]);
  const [fileModal, setFileModal] = React.useState<string>();
  const [folderModal, setFolderModal] = React.useState<string>();
  const [deleteModal, setDeleteModal] = React.useState<string>();
  const [searchKeyword, setSearchKeyword] = React.useState('');
  const [filteredNode, setFilteredNode] = React.useState<FileNode>(node);
  const [fileStatuses, setFileStatuses] = React.useState<
    Record<string, string>
  >({});

  React.useEffect(() => {
    if (node.path) setExpandedItems([node.path]);
    setFilteredNode(node);
  }, [node]);

  React.useEffect(() => {
    if (!project?.path) return;
    const statusMap: Record<string, string> = {};
    statuses.forEach((status) => {
      statusMap[status.path] = status.status;
    });
    setFileStatuses(statusMap);
  }, [project, statuses]);

  React.useEffect(() => {
    if (!searchKeyword) {
      setFilteredNode(node);
      setExpandedItems([node.path]);
      return;
    }

    const timeout = setTimeout(() => {
      const { filtered, expanded } = filterTreeAndCollectExpanded(
        node,
        searchKeyword,
      );
      setFilteredNode(filtered || { ...node, children: [] });
      setExpandedItems(expanded);
    }, 300);

    // eslint-disable-next-line consistent-return
    return () => clearTimeout(timeout);
  }, [searchKeyword, node]);

  return (
    <Container>
      <Box padding={1}>
        <Header>
          <div>File Explorer</div>
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
        </Header>

        <TextField
          fullWidth
          size="small"
          placeholder="Search files or folders..."
          onChange={(e) => setSearchKeyword(e.target.value)}
          value={searchKeyword}
          sx={{ mb: 1 }}
        />
      </Box>

      <StyledTreeView
        expandedItems={expandedItems}
        onExpandedItemsChange={(_, newExpanded) =>
          setExpandedItems(newExpanded)
        }
      >
        {filteredNode && (
          <RenderTree
            node={filteredNode}
            fileStatuses={fileStatuses}
            onFileSelect={onFileSelect}
            onDelete={(path) => setDeleteModal(path)}
            onNewFile={(path) => setFileModal(path)}
            onNewFolder={(path) => setFolderModal(path)}
            onDbtRun={onDbtRun}
            onDbtTest={onDbtTest}
            projectName={project!.name}
          />
        )}
      </StyledTreeView>
      {(fileModal || folderModal) && (
        <NewFileModal
          isOpen={!!folderModal || !!fileModal}
          onClose={() =>
            fileModal ? setFileModal(undefined) : setFolderModal(undefined)
          }
          type={fileModal ? 'file' : 'folder'}
          path={String(fileModal ?? folderModal)}
          successCallback={() => {
            setFileModal(undefined);
            setFolderModal(undefined);
            refreshFiles();
          }}
        />
      )}

      {deleteModal && (
        <ConfirmationModal
          title="Delete Item"
          isOpen={!!deleteModal}
          onClose={() => setDeleteModal(undefined)}
          onConfirm={async () => {
            await projectsServices.deleteItem({ filePath: deleteModal });
            setDeleteModal(undefined);
            onDeleteFileCallback(deleteModal);
            refreshFiles();
          }}
          question="Are you sure you want to delete?"
        />
      )}
    </Container>
  );
};

export { FileTreeViewer };
