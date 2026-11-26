/* eslint-disable no-nested-ternary */
import React, { useRef, useEffect } from 'react';
import { NodeRendererProps } from 'react-arborist';
import { styled, alpha } from '@mui/material/styles';
import { IconButton, TextField, Tooltip } from '@mui/material';
import {
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  CreateNewFolder as CreateFolderIcon,
  NoteAdd as CreateFileIcon,
  Delete as DeleteIcon,
  Cached as RefreshIcon,
  InsertChartOutlined as ChartBoardIcon,
} from '@mui/icons-material';
import { getClassWithColor } from 'file-icons-js';
import { YamlFileIcon } from '../fileIcon';
import { FileNode, FileStatuses } from './types';
import { GitStatusBadge } from './GitStatusBadge';
import { isChartsBoardPath, isChartsPartial } from '../../../shared/dbtCharts';
import type { FileTreeRow } from '../../../extensionApi/renderer';
import {
  fileTreeHoverPreviews,
  fileTreeRowActions,
} from '../../../extensionHost/renderer/contributions.renderer';
import { useRegistry } from '../../../extensionHost/renderer/registry.renderer';

// Pixels each tree level is indented by. The indent guides below are drawn
// at the same step, halfway between each ancestor folder's icon and its
// children's icons.
export const TREE_INDENT = 8;

// Thin vertical line showing which open folder a row belongs to.
const IndentGuide = styled('span')(({ theme }) => ({
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: 1,
  backgroundColor: alpha(theme.palette.text.primary, 0.1),
  pointerEvents: 'none',
}));

const NodeContainer = styled('div')<{
  $isSelected: boolean;
  $isEditing: boolean;
  $isDragOver: boolean;
}>(({ theme, $isSelected, $isEditing, $isDragOver }) => ({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  height: '100%',
  padding: '0 8px',
  cursor: $isEditing ? 'text' : 'pointer',
  backgroundColor: $isDragOver
    ? alpha(theme.palette.primary.main, 0.2)
    : $isSelected
      ? alpha(theme.palette.primary.main, 0.12)
      : 'transparent',
  transition: 'background-color 0.2s',
  borderRadius: $isDragOver ? '4px' : '0',
  '&:hover': {
    backgroundColor: $isDragOver
      ? alpha(theme.palette.primary.main, 0.25)
      : $isSelected
        ? alpha(theme.palette.primary.main, 0.12)
        : alpha(theme.palette.primary.main, 0.08),
    '& .node-actions': {
      opacity: 1,
    },
  },
}));

const NodeContent = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flex: 1,
  overflow: 'hidden',
  minWidth: 0,
});

const NodeLabel = styled('span')(({ theme }) => ({
  fontSize: '13px',
  color: theme.palette.text.primary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
  minWidth: 0,
}));

const NodeActions = styled('div')({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  opacity: 0,
  transition: 'opacity 0.2s',
});

const RenameInput = styled(TextField)(({ theme }) => ({
  '& .MuiInputBase-root': {
    fontSize: '13px',
    height: 24,
    padding: '0 4px',
  },
  '& .MuiInputBase-input': {
    padding: 0,
    color: theme.palette.text.primary,
  },
}));

const FileIconWrapper = styled('span')({
  fontSize: '14px',
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
});

const FolderIconWrapper = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
  color: theme.palette.primary.main,
  fontSize: '18px',
}));

interface TreeNodeProps extends NodeRendererProps<FileNode> {
  fileStatuses: FileStatuses;
  onContextMenu: (event: React.MouseEvent, node: FileNode) => void;
  onCreateFile: (parentPath: string) => void;
  onCreateFolder: (parentPath: string) => void;
  onDelete: (path: string) => void;
  onRefresh: () => void;
  dragOverFolder?: string | null;
  projectPath: string;
}

export const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  style,
  dragHandle,
  fileStatuses,
  onContextMenu,
  onCreateFile,
  onCreateFolder,
  onDelete,
  onRefresh,
  dragOverFolder,
  projectPath,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const isFolder = node.data.type === 'folder';
  const gitStatus = fileStatuses[node.data.path];
  // What extensions contributed for this row: a preview shown when the
  // pointer rests on the name, and buttons at the right end.
  const row: FileTreeRow = {
    path: node.data.path,
    name: node.data.name,
    isFolder,
    projectPath,
    gitStatus,
  };
  const HoverPreview = useRegistry(fileTreeHoverPreviews).find((preview) =>
    preview.when(row),
  )?.Component;
  const rowActions = useRegistry(fileTreeRowActions).filter((action) =>
    action.when(row),
  );
  const isExternalDragOver = isFolder && dragOverFolder === node.data.path;
  const isRootFolder = node.data.path === projectPath;

  useEffect(() => {
    if (node.isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [node.isEditing]);

  const handleClick = (e: React.MouseEvent) => {
    if (node.isEditing) {
      e.stopPropagation();
      return;
    }
    if (isFolder && !isRootFolder) {
      node.toggle();
    }
  };

  const handleRenameSubmit = (value: string) => {
    if (value && value.trim() !== '') {
      node.submit(value.trim());
    } else {
      node.reset();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRenameSubmit(e.currentTarget.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      node.reset();
    }
    e.stopPropagation();
  };

  const handleActionClick = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
  };

  const renderIcon = () => {
    if (isFolder) {
      return (
        <FolderIconWrapper>
          {node.isOpen ? (
            <FolderOpenIcon fontSize="inherit" />
          ) : (
            <FolderIcon fontSize="inherit" />
          )}
        </FolderIconWrapper>
      );
    }
    // dbt Charts board under the project-root charts/ folder (partials and
    // meta.yml keep the YAML badge: they have no page of their own).
    if (
      isChartsBoardPath(projectPath, node.data.path) &&
      !isChartsPartial(node.data.path)
    ) {
      return (
        <FileIconWrapper>
          <ChartBoardIcon fontSize="inherit" sx={{ color: 'primary.main' }} />
        </FileIconWrapper>
      );
    }
    // file-icons-js shows a database icon for YAML, so use the YML badge instead
    const lowerCaseName = node.data.name.toLowerCase();
    if (lowerCaseName.endsWith('.yml') || lowerCaseName.endsWith('.yaml')) {
      return (
        <FileIconWrapper>
          <YamlFileIcon />
        </FileIconWrapper>
      );
    }
    const iconClass = getClassWithColor(node.data.name);
    return (
      <FileIconWrapper>
        <span className={`icon ${iconClass}`} />
      </FileIconWrapper>
    );
  };

  return (
    <NodeContainer
      ref={dragHandle}
      style={style}
      $isSelected={node.isSelected}
      $isEditing={node.isEditing}
      $isDragOver={isExternalDragOver}
      onClick={handleClick}
      onContextMenu={(e) => onContextMenu(e, node.data)}
      data-node-path={node.data.path}
      data-node-type={node.data.type}
      onDragStart={
        !isFolder
          ? (e) => {
              // Add file path data for dropping to ChatWindow
              // This doesn't interfere with react-arborist's internal drag system
              e.dataTransfer.setData('application/x-file-path', node.data.path);
              e.dataTransfer.setData('text/plain', node.data.path);
            }
          : undefined
      }
    >
      {/* One guide per ancestor folder below the project root */}
      {Array.from({ length: Math.max(0, node.level - 1) }, (_, i) => (
        <IndentGuide
          key={i}
          style={{ left: (i + 1) * TREE_INDENT + TREE_INDENT / 2 }}
        />
      ))}
      <NodeContent>
        {renderIcon()}
        {node.isEditing ? (
          <RenameInput
            inputRef={inputRef}
            defaultValue={node.data.name}
            onBlur={(e) => handleRenameSubmit(e.target.value)}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            size="small"
            variant="standard"
            fullWidth
            InputProps={{
              onKeyDown: handleKeyDown,
            }}
          />
        ) : (
          <>
            {HoverPreview ? (
              <Tooltip
                // eslint-disable-next-line react/jsx-props-no-spreading
                title={<HoverPreview {...row} />}
                placement="right"
                enterDelay={500}
                enterNextDelay={500}
                slotProps={{
                  tooltip: { sx: { p: 0, bgcolor: 'transparent' } },
                }}
              >
                <NodeLabel>{node.data.name}</NodeLabel>
              </Tooltip>
            ) : (
              <NodeLabel title={node.data.name}>{node.data.name}</NodeLabel>
            )}
            {gitStatus && <GitStatusBadge status={gitStatus} />}
          </>
        )}
      </NodeContent>
      {!node.isEditing && isFolder && (
        <NodeActions className="node-actions">
          <IconButton
            size="small"
            onClick={(e) =>
              handleActionClick(e, () => onCreateFile(node.data.path))
            }
            title="New File"
            sx={{ padding: '4px' }}
          >
            <CreateFileIcon sx={{ fontSize: 16 }} />
          </IconButton>
          <IconButton
            size="small"
            onClick={(e) =>
              handleActionClick(e, () => onCreateFolder(node.data.path))
            }
            title="New Folder"
            sx={{ padding: '4px' }}
          >
            <CreateFolderIcon sx={{ fontSize: 16 }} />
          </IconButton>
          {!isRootFolder && (
            <IconButton
              size="small"
              onClick={(e) =>
                handleActionClick(e, () => onDelete(node.data.path))
              }
              title="Delete"
              sx={{ padding: '4px' }}
            >
              <DeleteIcon sx={{ fontSize: 16 }} />
            </IconButton>
          )}
        </NodeActions>
      )}
      {/* Outside the hover-only group, so it always shows */}
      {!node.isEditing && isRootFolder && (
        <IconButton
          size="small"
          onClick={(e) => handleActionClick(e, onRefresh)}
          title="Refresh directories"
          sx={{ padding: '4px', ml: '4px', flexShrink: 0 }}
        >
          <RefreshIcon sx={{ fontSize: 16 }} />
        </IconButton>
      )}
      {!node.isEditing &&
        rowActions.map((action) => (
          // eslint-disable-next-line react/jsx-props-no-spreading
          <action.Component key={action.id} {...row} />
        ))}
    </NodeContainer>
  );
};
