import React from 'react';
import { Box, IconButton, TextField, Typography, alpha } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  Folder,
  FolderOpen,
  CreateNewFolderOutlined,
  Check,
  Close,
} from '@mui/icons-material';
import { SimpleTreeView as TreeView, TreeItem } from '@mui/x-tree-view';
import { projectsServices } from '../../../services';
import { FileNode, Project } from '../../../../types/backend';

const PIPELINES_RELATIVE = 'rosetta/pipelines';

type Props = {
  project: Project;
  /** Relative directory under rosetta/pipelines/, '' meaning the root. */
  value: string;
  onChange: (subdir: string) => void;
  /** Bump to force a reload (e.g. each time the location step is entered). */
  reloadToken: number;
};

export const PipelineFolderTree: React.FC<Props> = ({
  project,
  value,
  onChange,
  reloadToken,
}) => {
  const theme = useTheme();
  const rootPath = `${project.path}/${PIPELINES_RELATIVE}`;

  const [root, setRoot] = React.useState<FileNode | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState<string[]>([rootPath]);
  const [creatingIn, setCreatingIn] = React.useState<string | null>(null);
  const [newFolderName, setNewFolderName] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const loadTree = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await projectsServices.loadProjectDirectory({
        path: rootPath,
      });
      setRoot(data);
    } catch {
      setRoot({
        id: rootPath,
        name: 'pipelines',
        path: rootPath,
        type: 'folder',
        children: [],
      });
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootPath, reloadToken]);

  React.useEffect(() => {
    loadTree();
  }, [loadTree]);

  React.useEffect(() => {
    if (creatingIn) {
      const raf = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
    return undefined;
  }, [creatingIn]);

  const toRelative = (absolutePath: string): string => {
    if (absolutePath === rootPath) return '';
    const prefix = `${rootPath}/`;
    return absolutePath.startsWith(prefix)
      ? absolutePath.slice(prefix.length)
      : absolutePath;
  };

  const cancelCreate = () => {
    setCreatingIn(null);
    setNewFolderName('');
  };

  const handleCreateFolder = async (parentAbsolutePath: string) => {
    const name = newFolderName.trim().replace(/[\\/]+/g, '');
    cancelCreate();
    if (!name) return;

    const parentRelative = toRelative(parentAbsolutePath);
    const newRelative = parentRelative ? `${parentRelative}/${name}` : name;

    await projectsServices.createFolderAsync({
      filePath: project.path,
      name: `${PIPELINES_RELATIVE}/${newRelative}`,
    });

    await loadTree();
    setExpanded((prev) =>
      prev.includes(parentAbsolutePath) ? prev : [...prev, parentAbsolutePath],
    );
    onChange(newRelative);
  };

  const renderFolder = (node: FileNode): React.ReactNode => {
    const folderChildren = (node.children ?? []).filter(
      (child) => child.type === 'folder',
    );
    const relative = toRelative(node.path);
    const isSelected = value === relative;
    const isCreatingHere = creatingIn === node.path;
    const isRoot = node.path === rootPath;

    return (
      <TreeItem
        key={node.path}
        itemId={node.path}
        label={
          <Box
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onChange(relative);
            }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              py: 0.4,
              px: 0.5,
              borderRadius: 0.75,
              bgcolor: isSelected
                ? alpha(theme.palette.primary.main, 0.12)
                : 'transparent',
              '&:hover': {
                bgcolor: isSelected
                  ? alpha(theme.palette.primary.main, 0.16)
                  : 'action.hover',
                '& .create-folder-btn': { opacity: 1 },
              },
            }}
          >
            {isSelected ? (
              <FolderOpen sx={{ fontSize: 16, color: 'primary.main' }} />
            ) : (
              <Folder sx={{ fontSize: 16, color: 'text.secondary' }} />
            )}
            <Typography
              variant="body2"
              sx={{
                fontWeight: isSelected ? 600 : 400,
                color: isSelected ? 'primary.main' : 'text.primary',
                flex: 1,
              }}
            >
              {isRoot ? 'rosetta/pipelines' : node.name}
            </Typography>
            <IconButton
              size="small"
              className="create-folder-btn"
              title="New folder"
              sx={{ opacity: 0, transition: 'opacity 0.15s', p: 0.25 }}
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((prev) =>
                  prev.includes(node.path) ? prev : [...prev, node.path],
                );
                setCreatingIn(node.path);
                setNewFolderName('');
              }}
            >
              <CreateNewFolderOutlined sx={{ fontSize: 15 }} />
            </IconButton>
          </Box>
        }
      >
        {folderChildren.map((child) => renderFolder(child))}
        {isCreatingHere && (
          <TreeItem
            itemId={`${node.path}__new`}
            label={
              <Box
                onClick={(e) => e.stopPropagation()}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  py: 0.4,
                  px: 0.5,
                }}
              >
                <Folder sx={{ fontSize: 16, color: 'text.disabled' }} />
                <TextField
                  inputRef={inputRef}
                  size="small"
                  variant="standard"
                  placeholder="Folder name"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    // Stop the tree's roving-focus/type-ahead handler from
                    // hijacking keystrokes (e.g. typing "t" jumping focus to
                    // a folder named "test" instead of landing in the input).
                    e.stopPropagation();
                    if (e.key === 'Enter') handleCreateFolder(node.path);
                    if (e.key === 'Escape') cancelCreate();
                  }}
                  onKeyUp={(e) => e.stopPropagation()}
                  sx={{ flex: 1 }}
                />
                <IconButton
                  size="small"
                  onClick={() => handleCreateFolder(node.path)}
                >
                  <Check sx={{ fontSize: 15 }} />
                </IconButton>
                <IconButton size="small" onClick={cancelCreate}>
                  <Close sx={{ fontSize: 15 }} />
                </IconButton>
              </Box>
            }
          />
        )}
      </TreeItem>
    );
  };

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        height: 220,
        overflow: 'auto',
        p: 1,
        bgcolor: 'background.paper',
      }}
    >
      {isLoading || !root ? (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'text.secondary',
          }}
        >
          <Typography variant="caption">Loading folders…</Typography>
        </Box>
      ) : (
        <TreeView
          expandedItems={expanded}
          onExpandedItemsChange={(_e, ids) => setExpanded(ids)}
        >
          {renderFolder(root)}
        </TreeView>
      )}
    </Box>
  );
};
