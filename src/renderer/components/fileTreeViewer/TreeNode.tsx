/* eslint-disable no-nested-ternary */
import React, { useRef, useEffect } from 'react';
import { NodeRendererProps } from 'react-arborist';
import { styled, alpha } from '@mui/material/styles';
import { IconButton, TextField } from '@mui/material';
import {
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  CreateNewFolder as CreateFolderIcon,
  NoteAdd as CreateFileIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { getClassWithColor } from 'file-icons-js';
import { FileNode, FileStatuses } from './types';
import { GitStatusBadge } from './GitStatusBadge';

const NodeContainer = styled('div')<{
  $isSelected: boolean;
  $isEditing: boolean;
  $isDragOver: boolean;
}>(({ theme, $isSelected, $isEditing, $isDragOver }) => ({
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
  gap: 8,
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
  dragOverFolder,
  projectPath,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const isFolder = node.data.type === 'folder';
  const gitStatus = fileStatuses[node.data.path];
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
    >
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
          />
        ) : (
          <>
            <NodeLabel title={node.data.name}>{node.data.name}</NodeLabel>
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
        </NodeActions>
      )}
    </NodeContainer>
  );
};
