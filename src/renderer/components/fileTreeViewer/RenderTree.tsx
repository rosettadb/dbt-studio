import React from 'react';
import { TreeItem } from '@mui/x-tree-view';
import {
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  PopoverPosition,
  Tooltip,
} from '@mui/material';
import {
  NoteAddOutlined,
  CreateNewFolderOutlined,
  RefreshOutlined,
  Delete,
  ContentCopy,
  FileCopy,
  ContentPaste,
  CreateNewFolder,
  NoteAdd,
  Archive,
  DriveFileRenameOutline,
  Folder,
} from '@mui/icons-material';
import { toast } from 'react-toastify';

import { TreeItems } from './TreeItems';
import { FileNode } from '../../../types/backend';
import {
  ActionsContainer,
  LabelContainer,
  RenameInput,
  StyledTreeItem,
} from './styles';
import { projectsServices } from '../../services';
import { FileIcon } from '../fileIcon';

type Props = {
  node: FileNode;
  fileStatuses: Record<string, string>;
  onFileSelect: (file: FileNode) => void;
  onDelete: (path: string) => void;
  onNewFolder: (path: string) => void;
  onNewFile: (path: string) => void;
  projectName: string;
  projectPath: string;
  onRefresh?: () => void;
  onCopyPath: (path: string) => void;
  copyPathData: string;
  onPastePath: (source: string, target: string) => void;
};

const getColorByStatus = (status?: string) => {
  switch (status) {
    case 'modified':
      return '#589838';
    case 'untracked':
      return '#9f3838';
    case 'staged':
      return 'green';
    case 'deleted':
      return 'red';
    case 'renamed':
      return 'blue';
    case 'conflicted':
      return 'purple';
    default:
      return 'inherit';
  }
};

const RenderTree: React.FC<Props> = ({
  node,
  fileStatuses,
  onFileSelect,
  onDelete,
  onNewFolder,
  onNewFile,
  projectName,
  projectPath,
  onRefresh,
  onCopyPath,
  onPastePath,
  copyPathData,
}) => {
  const [menuPosition, setMenuPosition] =
    React.useState<null | PopoverPosition>(null);

  const [renameOpen, setRenameOpen] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState<string>('');
  const renameInputRef = React.useRef<HTMLInputElement>(null);

  // Ensure input receives focus and selects current text when renaming starts
  React.useEffect(() => {
    if (renameOpen && renameInputRef.current) {
      // Focus and select the whole filename for quick overwrite
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renameOpen]);

  const saveRename = React.useCallback(async () => {
    const newName = renameValue.trim();
    if (!newName || newName === node.name) {
      setRenameOpen(false);
      return;
    }
    try {
      await projectsServices.renamePath({
        path: node.path,
        newName,
      });
      if (typeof onRefresh === 'function') {
        onRefresh();
      }
    } catch (e: any) {
      toast.error(`Rename failed: ${e?.message || 'Unknown error'}`);
    } finally {
      setRenameOpen(false);
    }
  }, [renameValue, node.path, node.name, onRefresh]);

  const fileStatus = fileStatuses[node.path];
  const labelColor = getColorByStatus(fileStatus);

  const label = React.useMemo(() => {
    if (node.type === 'folder' && node.path === projectPath) {
      return <TreeItems.Root label={node.name} />;
    }
    if (node.type === 'folder') {
      return <TreeItems.Folder label={node.name} />;
    }
    return (
      <TreeItems.File label={node.name} color={getColorByStatus(fileStatus)} />
    );
  }, [node, labelColor]);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setMenuPosition({
      top: event.clientY,
      left: event.clientX,
    });
  };

  const handleMenuClose = () => {
    setMenuPosition(null);
  };

  return (
    <TreeItem
      itemId={node.path}
      onContextMenu={handleMenuOpen}
      label={
        <LabelContainer>
          {renameOpen ? (
            <StyledTreeItem
              onMouseDown={(e) => {
                // Keep focus on input when clicking outside the input,
                // but allow normal selection/caret behavior when clicking the input itself.
                const target = e.target as HTMLElement;
                const isInput =
                  target.tagName === 'INPUT' || !!target.closest('input');
                if (!isInput) {
                  e.preventDefault();
                  e.stopPropagation();
                  renameInputRef.current?.focus();
                }
              }}
            >
              {node.type === 'folder' ? (
                <Folder
                  sx={{
                    color: node.name === '.git' ? '#aabdefff' : '#5f89f4',
                    width: 14,
                    height: 14,
                    pointerEvents: 'none',
                  }}
                />
              ) : (
                <span style={{ pointerEvents: 'none', display: 'inline-flex' }}>
                  <FileIcon fileName={node.name} />
                </span>
              )}
              <RenameInput
                ref={renameInputRef}
                value={renameValue}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setRenameValue(e.target.value)
                }
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    saveRename();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setRenameOpen(false);
                  }
                }}
                onBlur={() => setRenameOpen(false)}
                style={{ flex: 1 }}
              />
            </StyledTreeItem>
          ) : (
            label
          )}
          {!renameOpen && (
            <ActionsContainer className="actions-container">
              {node.path === projectPath && (
                <IconButton
                  size="small"
                  edge="end"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (typeof onRefresh === 'function') {
                      onRefresh();
                    }
                    handleMenuClose();
                  }}
                >
                  <Tooltip title="Refresh">
                    <RefreshOutlined fontSize="small" />
                  </Tooltip>
                </IconButton>
              )}
              {node.type === 'folder' && (
                <>
                  <IconButton
                    size="small"
                    edge="end"
                    onClick={(event) => {
                      event.stopPropagation();
                      onNewFile(node.path);
                      handleMenuClose();
                    }}
                  >
                    <Tooltip title="Create new file">
                      <NoteAddOutlined fontSize="small" />
                    </Tooltip>
                  </IconButton>
                  <IconButton
                    size="small"
                    edge="end"
                    onClick={(event) => {
                      event.stopPropagation();
                      onNewFolder(node.path);
                      handleMenuClose();
                    }}
                  >
                    <Tooltip title="Create new folder">
                      <CreateNewFolderOutlined fontSize="small" />
                    </Tooltip>
                  </IconButton>
                </>
              )}
            </ActionsContainer>
          )}
          <Menu
            anchorReference="anchorPosition"
            open={Boolean(menuPosition)}
            anchorPosition={
              menuPosition
                ? { top: menuPosition.top, left: menuPosition.left }
                : undefined
            }
            onClose={handleMenuClose}
          >
            <MenuItem
              onClick={(event) => {
                event.stopPropagation();
                setRenameValue(node.name);
                setRenameOpen(true);
                handleMenuClose();
              }}
            >
              <ListItemIcon>
                <DriveFileRenameOutline fontSize="small" />
              </ListItemIcon>
              <ListItemText>Rename</ListItemText>
            </MenuItem>

            <MenuItem
              onClick={(event) => {
                event.stopPropagation();
                onDelete(node.path);
                handleMenuClose();
              }}
            >
              <ListItemIcon>
                <Delete fontSize="small" />
              </ListItemIcon>
              <ListItemText>Delete</ListItemText>
            </MenuItem>

            <MenuItem
              onClick={(event) => {
                event.stopPropagation();
                navigator.clipboard.writeText(node.path);
                handleMenuClose();
              }}
            >
              <ListItemIcon>
                <ContentCopy fontSize="small" />
              </ListItemIcon>
              <ListItemText>Copy Path</ListItemText>
            </MenuItem>

            <MenuItem
              onClick={(event) => {
                event.stopPropagation();
                onCopyPath(node.path);
                handleMenuClose();
              }}
            >
              <ListItemIcon>
                <FileCopy fontSize="small" />
              </ListItemIcon>
              <ListItemText>Copy</ListItemText>
            </MenuItem>

            {node.type === 'folder' && (
              <>
                {copyPathData !== '' && (
                  <MenuItem
                    onClick={(event) => {
                      event.stopPropagation();
                      onPastePath(copyPathData, node.path);
                      handleMenuClose();
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <ContentPaste sx={{ fontSize: 16 }} />
                    </ListItemIcon>
                    <ListItemText primaryTypographyProps={{ fontSize: 14 }}>
                      Paste
                    </ListItemText>
                  </MenuItem>
                )}

                <MenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    onNewFolder(node.path);
                    handleMenuClose();
                  }}
                >
                  <ListItemIcon>
                    <CreateNewFolder fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>New Folder</ListItemText>
                </MenuItem>

                <MenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    onNewFile(node.path);
                    handleMenuClose();
                  }}
                >
                  <ListItemIcon>
                    <NoteAdd fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>New File</ListItemText>
                </MenuItem>

                <MenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    projectsServices.zipDir(node.path);
                    handleMenuClose();
                  }}
                >
                  <ListItemIcon>
                    <Archive fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>Zip Dir</ListItemText>
                </MenuItem>
              </>
            )}
          </Menu>
        </LabelContainer>
      }
      onClick={() => {
        if (node.type === 'file') {
          onFileSelect(node);
        }
      }}
    >
      {node.children?.map((childNode) => (
        <RenderTree
          key={childNode.path}
          node={childNode}
          fileStatuses={fileStatuses}
          onFileSelect={onFileSelect}
          onDelete={onDelete}
          onNewFolder={onNewFolder}
          onNewFile={onNewFile}
          projectName={projectName}
          projectPath={projectPath}
          onRefresh={onRefresh}
          onCopyPath={onCopyPath}
          onPastePath={onPastePath}
          copyPathData={copyPathData}
        />
      ))}
    </TreeItem>
  );
};

export { RenderTree };
