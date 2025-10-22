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
import { RenderTree } from './RenderTree';
import { Container, StyledTreeView } from './styles';
import { FileNode, FileStatus } from '../../../types/backend';
import { ConfirmationModal, NewFileModal } from '../modals';
import { projectsServices } from '../../services';
import { useGetSelectedProject } from '../../controllers';

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

const pathExistsInTree = (node: FileNode, targetPath: string): boolean => {
  if (node.path === targetPath) return true;

  if (node.type === 'folder' && node.children) {
    return node.children.some((child) => pathExistsInTree(child, targetPath));
  }

  return false;
};

const findPathToNode = (
  node: FileNode,
  targetPath: string,
): string[] | null => {
  if (node.path === targetPath) {
    return [node.path];
  }

  if (node.type === 'folder' && node.children?.length) {
    const childPath = node.children.reduce<string[] | null>((found, child) => {
      if (found) {
        return found;
      }
      const candidate = findPathToNode(child, targetPath);
      return candidate ?? null;
    }, null);

    if (childPath) {
      return [node.path, ...childPath];
    }
  }

  return null;
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
  const [copyPathData, setCopyPathData] = React.useState<string>('');

  const prevExpandedRef = React.useRef<string[]>([]);
  const prevNodeRef = React.useRef<FileNode>();

  const preservedExpandedItems = React.useMemo(() => {
    if (!node.path) return [];

    const nodeChanged =
      !prevNodeRef.current || prevNodeRef.current.path !== node.path;

    if (prevExpandedRef.current.length === 0 || nodeChanged) {
      return [node.path];
    }
    const validExpandedPaths = prevExpandedRef.current.filter((path) =>
      pathExistsInTree(node, path),
    );

    return validExpandedPaths.includes(node.path)
      ? validExpandedPaths
      : [node.path, ...validExpandedPaths];
  }, [node]);

  React.useEffect(() => {
    setExpandedItems(preservedExpandedItems);
    setFilteredNode(node);
    prevNodeRef.current = node;
  }, [node, preservedExpandedItems]);

  React.useEffect(() => {
    prevExpandedRef.current = expandedItems;
  }, [expandedItems]);

  React.useEffect(() => {
    if (!selectedPath) {
      return;
    }

    const pathToNode = findPathToNode(node, selectedPath);
    if (!pathToNode) {
      return;
    }

    const ancestorFolders = pathToNode.slice(0, -1);
    if (ancestorFolders.length === 0) {
      return;
    }

    setExpandedItems((prev) => {
      const next = new Set(prev);
      let changed = false;
      ancestorFolders.forEach((folderPath) => {
        if (!next.has(folderPath)) {
          next.add(folderPath);
          changed = true;
        }
      });

      return changed ? Array.from(next) : prev;
    });
  }, [node, selectedPath]);

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
      if (prevExpandedRef.current.length > 0) {
        const validExpandedPaths = prevExpandedRef.current.filter((path) =>
          pathExistsInTree(node, path),
        );
        setExpandedItems(
          validExpandedPaths.length > 0 ? validExpandedPaths : [node.path],
        );
      } else {
        setExpandedItems([node.path]);
      }
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

  const handleExpandedItemsChange = React.useCallback(
    (newExpanded: string[]) => {
      setExpandedItems(newExpanded);
    },
    [],
  );

  const selectedItems = React.useMemo(() => {
    if (!selectedPath) {
      return [];
    }

    return pathExistsInTree(filteredNode, selectedPath) ? [selectedPath] : [];
  }, [filteredNode, selectedPath]);

  return (
    <Container>
      <Box
        padding={1}
        display="flex"
        sx={{ alignItems: 'center', mb: 1, gap: 1 }}
      >
        <TextField
          fullWidth
          size="small"
          placeholder="Search files or folders..."
          onChange={(e) => setSearchKeyword(e.target.value)}
          value={searchKeyword}
          sx={{ height: '40px' }}
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

      <StyledTreeView
        expandedItems={expandedItems}
        selectedItems={selectedItems}
        onExpandedItemsChange={(_, items) => handleExpandedItemsChange(items)}
      >
        <RenderTree
          node={filteredNode}
          fileStatuses={fileStatuses}
          onFileSelect={onFileSelect}
          onDelete={(path) => setDeleteModal(path)}
          onNewFile={(path) => setFileModal(path)}
          onNewFolder={(path) => setFolderModal(path)}
          projectName={project!.name}
          projectPath={project!.path}
          onRefresh={() => refreshFiles()}
          onCopyPath={(path) => setCopyPathData(path)}
          onPastePath={(source, target) => copyPath(source, target)}
          copyPathData={copyPathData}
          selectedPath={selectedPath}
        />
      </StyledTreeView>
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
