import React from 'react';
import { TreeItem } from '@mui/x-tree-view';
import {
  IconButton,
  Menu,
  MenuItem,
  PopoverPosition,
  Tooltip,
} from '@mui/material';
import {
  MoreVert,
  NoteAddOutlined,
  CreateNewFolderOutlined,
  RefreshOutlined,
} from '@mui/icons-material';
import { TreeItems } from './TreeItems';
import { FileNode } from '../../../types/backend';
import { ActionsContainer, LabelContainer } from './styles';
import { projectsServices } from '../../services';

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
}) => {
  const [menuPosition, setMenuPosition] =
    React.useState<null | PopoverPosition>(null);

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
          {label}
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
            )}
            {node.type === 'folder' && (
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
            )}
            {node.path !== projectPath && (
              <IconButton size="small" onClick={handleMenuOpen}>
                <MoreVert fontSize="small" />
              </IconButton>
            )}
          </ActionsContainer>
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
                onDelete(node.path);
                handleMenuClose();
              }}
            >
              Delete
            </MenuItem>
            <MenuItem
              onClick={(event) => {
                event.stopPropagation();
                navigator.clipboard.writeText(node.path);
                handleMenuClose();
              }}
            >
              Copy Path
            </MenuItem>
            {node.type === 'folder' && (
              <>
                <MenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    onNewFolder(node.path);
                    handleMenuClose();
                  }}
                >
                  New Folder
                </MenuItem>
                <MenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    onNewFile(node.path);
                    handleMenuClose();
                  }}
                >
                  New File
                </MenuItem>
                <MenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    projectsServices.zipDir(node.path);
                    handleMenuClose();
                  }}
                >
                  Zip Dir
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
        />
      ))}
    </TreeItem>
  );
};

export { RenderTree };
