import React from 'react';
import {
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@mui/material';
import {
  Edit as RenameIcon,
  Delete as DeleteIcon,
  ContentCopy as CopyIcon,
  ContentPaste as PasteIcon,
  FileCopy as CopyPathIcon,
  CreateNewFolder as NewFolderIcon,
  NoteAdd as NewFileIcon,
} from '@mui/icons-material';
import { TreeContextMenuState, CopiedNode } from './types';

interface TreeContextMenuProps {
  contextMenu: TreeContextMenuState | null;
  copiedNode: CopiedNode | null;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onCopyPath: () => void;
  onNewFile: () => void;
  onNewFolder: () => void;
}

export const TreeContextMenu: React.FC<TreeContextMenuProps> = ({
  contextMenu,
  copiedNode,
  onClose,
  onRename,
  onDelete,
  onCopy,
  onPaste,
  onCopyPath,
  onNewFile,
  onNewFolder,
}) => {
  if (!contextMenu) return null;

  const isFolder = contextMenu.node.type === 'folder';
  const canPaste = isFolder && copiedNode !== null;

  const handleMenuItemClick = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <Menu
      open={Boolean(contextMenu)}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={{
        top: contextMenu.mouseY,
        left: contextMenu.mouseX,
      }}
      slotProps={{
        paper: {
          sx: {
            minWidth: 200,
          },
        },
      }}
    >
      <MenuItem onClick={() => handleMenuItemClick(onRename)}>
        <ListItemIcon>
          <RenameIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Rename</ListItemText>
      </MenuItem>

      <MenuItem onClick={() => handleMenuItemClick(onDelete)}>
        <ListItemIcon>
          <DeleteIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Delete</ListItemText>
      </MenuItem>

      <Divider />

      <MenuItem onClick={() => handleMenuItemClick(onCopy)}>
        <ListItemIcon>
          <CopyIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Copy</ListItemText>
      </MenuItem>

      {canPaste && (
        <MenuItem onClick={() => handleMenuItemClick(onPaste)}>
          <ListItemIcon>
            <PasteIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Paste</ListItemText>
        </MenuItem>
      )}

      <MenuItem onClick={() => handleMenuItemClick(onCopyPath)}>
        <ListItemIcon>
          <CopyPathIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Copy Path</ListItemText>
      </MenuItem>

      {isFolder && (
        <>
          <Divider />
          <MenuItem onClick={() => handleMenuItemClick(onNewFile)}>
            <ListItemIcon>
              <NewFileIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>New File</ListItemText>
          </MenuItem>

          <MenuItem onClick={() => handleMenuItemClick(onNewFolder)}>
            <ListItemIcon>
              <NewFolderIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>New Folder</ListItemText>
          </MenuItem>
        </>
      )}
    </Menu>
  );
};
