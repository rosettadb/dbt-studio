import React, { useMemo, useState, useCallback } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@mui/material';
import {
  Delete,
  Description,
  Edit,
  FileCopy,
  LibraryBooks,
} from '@mui/icons-material';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import { PythonNotebook } from '../../../types/notebooks';

interface PythonNotebooksTreeViewProps {
  notebooks: PythonNotebook[];
  isLoading: boolean;
  filter: string;
  onOpenNotebook: (notebookId: string) => void;
  onRenameNotebook: (notebookId: string, currentName: string) => void;
  onDuplicateNotebook: (notebookId: string, currentName: string) => void;
  onDeleteNotebook: (notebookId: string, notebookName: string) => void;
}

type ContextMenuState = {
  mouseX: number;
  mouseY: number;
  notebookId: string;
  notebookName: string;
} | null;

export const PythonNotebooksTreeView: React.FC<
  PythonNotebooksTreeViewProps
> = ({
  notebooks,
  isLoading,
  filter,
  onOpenNotebook,
  onRenameNotebook,
  onDuplicateNotebook,
  onDeleteNotebook,
}) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

  const filteredNotebooks = useMemo(() => {
    if (!filter) return notebooks;
    const lowerFilter = filter.toLowerCase();
    return notebooks.filter((n) => n.name.toLowerCase().includes(lowerFilter));
  }, [notebooks, filter]);

  const handleContextMenu = useCallback(
    (event: React.MouseEvent, notebookId: string, notebookName: string) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({
        mouseX: event.clientX,
        mouseY: event.clientY,
        notebookId,
        notebookName,
      });
    },
    [],
  );

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleMenuAction = useCallback(
    (action: 'open' | 'rename' | 'duplicate' | 'delete') => {
      if (!contextMenu) return;
      switch (action) {
        case 'open':
          onOpenNotebook(contextMenu.notebookId);
          break;
        case 'rename':
          onRenameNotebook(contextMenu.notebookId, contextMenu.notebookName);
          break;
        case 'duplicate':
          onDuplicateNotebook(contextMenu.notebookId, contextMenu.notebookName);
          break;
        case 'delete':
          onDeleteNotebook(contextMenu.notebookId, contextMenu.notebookName);
          break;
        default:
          break;
      }
      handleCloseContextMenu();
    },
    [
      contextMenu,
      onOpenNotebook,
      onRenameNotebook,
      onDuplicateNotebook,
      onDeleteNotebook,
      handleCloseContextMenu,
    ],
  );

  if (isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 2,
        }}
      >
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (filteredNotebooks.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
            whiteSpace: 'normal',
          }}
        >
          {filter
            ? 'No notebooks match your filter'
            : 'No Python notebooks yet. Click the + button to create one.'}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <SimpleTreeView
          defaultExpandedItems={['python-notebooks-root']}
          sx={{
            '& .MuiTreeItem-root': {
              '& .MuiTreeItem-content': {
                padding: '0px 2px',
                minHeight: '26px',
                borderRadius: '4px',
                '&:hover': { backgroundColor: 'action.hover' },
                '&.Mui-selected': {
                  backgroundColor: 'transparent',
                  '&:hover': { backgroundColor: 'action.hover' },
                },
                '&.Mui-focused': { backgroundColor: 'transparent' },
              },
              '& .MuiTreeItem-label': { fontSize: '0.85rem', padding: '0px' },
              '& .MuiTreeItem-iconContainer': {
                width: '12px',
                marginRight: '2px',
                '& svg': { fontSize: '16px' },
              },
              '& .MuiTreeItem-groupTransition': {
                marginLeft: '12px',
                paddingLeft: '0px',
              },
            },
          }}
        >
          <TreeItem
            itemId="python-notebooks-root"
            label={
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0 }}
              >
                <LibraryBooks sx={{ fontSize: 14, color: 'text.secondary' }} />
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 500,
                    fontSize: '0.85rem',
                    color: 'text.primary',
                  }}
                >
                  My Notebooks
                </Typography>
              </Box>
            }
          >
            {filteredNotebooks.map((notebook) => (
              <TreeItem
                key={notebook.id}
                itemId={notebook.id}
                label={
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      py: 0,
                      pr: 1,
                      width: '100%',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenNotebook(notebook.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        onOpenNotebook(notebook.id);
                      }
                    }}
                    onContextMenu={(e) =>
                      handleContextMenu(e, notebook.id, notebook.name)
                    }
                    role="button"
                    tabIndex={0}
                  >
                    <Description
                      sx={{ fontSize: 14, color: 'text.secondary' }}
                    />
                    <Typography
                      variant="body2"
                      sx={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '0.825rem',
                        flex: 1,
                      }}
                    >
                      {notebook.name}
                    </Typography>
                  </Box>
                }
              />
            ))}
          </TreeItem>
        </SimpleTreeView>
      </Box>

      {/* Context Menu */}
      <Menu
        open={contextMenu !== null}
        onClose={handleCloseContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
        slotProps={{ paper: { sx: { minWidth: 'auto' } } }}
      >
        <MenuItem
          onClick={() => handleMenuAction('open')}
          sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}
        >
          <ListItemIcon sx={{ minWidth: 28 }}>
            <Description fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Open"
            primaryTypographyProps={{ fontSize: '0.75rem' }}
          />
        </MenuItem>
        <MenuItem
          onClick={() => handleMenuAction('rename')}
          sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}
        >
          <ListItemIcon sx={{ minWidth: 28 }}>
            <Edit fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Rename"
            primaryTypographyProps={{ fontSize: '0.75rem' }}
          />
        </MenuItem>
        <MenuItem
          onClick={() => handleMenuAction('duplicate')}
          sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}
        >
          <ListItemIcon sx={{ minWidth: 28 }}>
            <FileCopy fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Duplicate"
            primaryTypographyProps={{ fontSize: '0.75rem' }}
          />
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => handleMenuAction('delete')}
          sx={{ fontSize: '0.75rem', py: 0.5, px: 1, color: 'error.main' }}
        >
          <ListItemIcon sx={{ minWidth: 28 }}>
            <Delete fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText
            primary="Delete"
            primaryTypographyProps={{
              fontSize: '0.75rem',
              color: 'error.main',
            }}
          />
        </MenuItem>
      </Menu>
    </Box>
  );
};
