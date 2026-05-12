import React, { useMemo, useState, useCallback } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Checkbox,
  FormControlLabel,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@mui/material';
import {
  Description,
  Delete,
  Restore,
  Archive,
  Edit,
  FileCopy,
  LibraryBooks,
} from '@mui/icons-material';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import { Notebook } from '../../../types/notebooks';

interface NotebooksTreeViewProps {
  notebooks: Notebook[];
  isLoading: boolean;
  archivedNotebooks: Record<string, Notebook[]>;
  showArchived: boolean;
  filter: string;
  onOpenNotebook: (notebookId: string) => void;
  onRenameNotebook: (notebookId: string, currentName: string) => void;
  onDuplicateNotebook: (notebookId: string, currentName: string) => void;
  onDeleteNotebook: (notebookId: string, notebookName: string) => void;
  onRestoreNotebook: (connectionKey: string, notebookId: string) => void;
  onDeleteArchivedNotebook: (
    connectionKey: string,
    notebookId: string,
    notebookName: string,
  ) => void;
  onToggleArchived: (show: boolean) => void;
  getConnectionName: (connectionKey: string) => string;
}

type ContextMenuState = {
  mouseX: number;
  mouseY: number;
  notebookId: string;
  notebookName: string;
  isArchived: boolean;
  connectionKey?: string;
} | null;

export const NotebooksTreeView: React.FC<NotebooksTreeViewProps> = ({
  notebooks,
  isLoading,
  archivedNotebooks,
  showArchived,
  filter,
  onOpenNotebook,
  onRenameNotebook,
  onDuplicateNotebook,
  onDeleteNotebook,
  onRestoreNotebook,
  onDeleteArchivedNotebook,
  onToggleArchived,
  getConnectionName,
}) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

  // Filter notebooks
  const filteredNotebooks = useMemo(() => {
    if (!filter) return notebooks;
    const lowerFilter = filter.toLowerCase();
    return notebooks.filter((notebook) =>
      notebook.name.toLowerCase().includes(lowerFilter),
    );
  }, [notebooks, filter]);

  // Filter archived notebooks
  const filteredArchivedNotebooks = useMemo(() => {
    if (!filter) return archivedNotebooks;
    const lowerFilter = filter.toLowerCase();
    const filtered: Record<string, Notebook[]> = {};
    Object.entries(archivedNotebooks).forEach(
      ([connectionKey, notebookList]) => {
        const filteredList = notebookList.filter((notebook) =>
          notebook.name.toLowerCase().includes(lowerFilter),
        );
        if (filteredList.length > 0) {
          filtered[connectionKey] = filteredList;
        }
      },
    );
    return filtered;
  }, [archivedNotebooks, filter]);

  const handleContextMenu = useCallback(
    (
      event: React.MouseEvent,
      notebookId: string,
      notebookName: string,
      isArchived: boolean,
      connectionKey?: string,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({
        mouseX: event.clientX,
        mouseY: event.clientY,
        notebookId,
        notebookName,
        isArchived,
        connectionKey,
      });
    },
    [],
  );

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleMenuAction = useCallback(
    (action: 'open' | 'rename' | 'duplicate' | 'delete' | 'restore') => {
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
          if (contextMenu.isArchived && contextMenu.connectionKey) {
            onDeleteArchivedNotebook(
              contextMenu.connectionKey,
              contextMenu.notebookId,
              contextMenu.notebookName,
            );
          } else {
            onDeleteNotebook(contextMenu.notebookId, contextMenu.notebookName);
          }
          break;
        case 'restore':
          if (contextMenu.connectionKey) {
            onRestoreNotebook(
              contextMenu.connectionKey,
              contextMenu.notebookId,
            );
          }
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
      onDeleteArchivedNotebook,
      onRestoreNotebook,
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

  if (
    filteredNotebooks.length === 0 &&
    (!showArchived || Object.keys(filteredArchivedNotebooks).length === 0)
  ) {
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
            : 'No notebooks yet. Click the + button to create one.'}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <SimpleTreeView
          defaultExpandedItems={['notebooks-root', 'archived-root']}
          sx={{
            '& .MuiTreeItem-root': {
              '& .MuiTreeItem-content': {
                padding: '0px 2px',
                minHeight: '26px',
                borderRadius: '4px',
                '&:hover': {
                  backgroundColor: 'action.hover',
                },
                '&.Mui-selected': {
                  backgroundColor: 'transparent',
                  '&:hover': {
                    backgroundColor: 'action.hover',
                  },
                },
                '&.Mui-focused': {
                  backgroundColor: 'transparent',
                },
              },
              '& .MuiTreeItem-label': {
                fontSize: '0.85rem',
                padding: '0px',
              },
              '& .MuiTreeItem-iconContainer': {
                width: '12px',
                marginRight: '2px',
                '& svg': {
                  fontSize: '16px',
                },
              },
              '& .MuiTreeItem-groupTransition': {
                marginLeft: '12px',
                paddingLeft: '0px',
              },
            },
          }}
        >
          {/* Active Notebooks */}
          {filteredNotebooks.length > 0 && (
            <TreeItem
              itemId="notebooks-root"
              label={
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    py: 0,
                  }}
                >
                  <LibraryBooks
                    sx={{ fontSize: 14, color: 'text.secondary' }}
                  />
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
                        handleContextMenu(e, notebook.id, notebook.name, false)
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
          )}

          {/* Archived Notebooks */}
          {showArchived &&
            Object.keys(filteredArchivedNotebooks).length > 0 && (
              <TreeItem
                itemId="archived-root"
                label={
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      py: 0,
                    }}
                  >
                    <Archive sx={{ fontSize: 14, color: 'text.secondary' }} />
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 500,
                        fontSize: '0.85rem',
                        color: 'text.primary',
                      }}
                    >
                      Archived
                    </Typography>
                  </Box>
                }
              >
                {Object.entries(filteredArchivedNotebooks).map(
                  ([connectionKey, archivedList]) => (
                    <TreeItem
                      key={connectionKey}
                      itemId={connectionKey}
                      label={
                        <Typography
                          variant="body2"
                          sx={{ fontSize: '0.825rem', color: 'text.secondary' }}
                        >
                          {getConnectionName(connectionKey)} (
                          {archivedList.length})
                        </Typography>
                      }
                    >
                      {archivedList.map((notebook) => (
                        <TreeItem
                          key={`archived-${notebook.id}`}
                          itemId={`archived-${notebook.id}`}
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
                              onContextMenu={(e) =>
                                handleContextMenu(
                                  e,
                                  notebook.id,
                                  notebook.name,
                                  true,
                                  connectionKey,
                                )
                              }
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
                                  fontSize: '0.75rem',
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
                  ),
                )}
              </TreeItem>
            )}
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
        slotProps={{
          paper: {
            sx: {
              minWidth: 'auto',
            },
          },
        }}
      >
        {!contextMenu?.isArchived && (
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
        )}
        {!contextMenu?.isArchived && (
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
        )}
        {!contextMenu?.isArchived && (
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
        )}
        {contextMenu?.isArchived && (
          <MenuItem
            onClick={() => handleMenuAction('restore')}
            sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}
          >
            <ListItemIcon sx={{ minWidth: 28 }}>
              <Restore fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary="Restore"
              primaryTypographyProps={{ fontSize: '0.75rem' }}
            />
          </MenuItem>
        )}
        <Divider sx={{ my: 0.25 }} />
        <MenuItem
          onClick={() => handleMenuAction('delete')}
          sx={{
            color: 'error.main',
            fontSize: '0.75rem',
            py: 0.5,
            px: 1,
          }}
        >
          <ListItemIcon sx={{ minWidth: 28 }}>
            <Delete fontSize="small" sx={{ color: 'error.main' }} />
          </ListItemIcon>
          <ListItemText
            primary={contextMenu?.isArchived ? 'Delete Permanently' : 'Delete'}
            primaryTypographyProps={{ fontSize: '0.75rem' }}
          />
        </MenuItem>
      </Menu>

      {/* Show Archived Toggle */}
      <Box
        sx={{
          px: 1,
          py: 0.5,
          borderTop: (theme) => `1px solid ${theme.palette.divider}`,
          mt: 'auto',
        }}
      >
        <FormControlLabel
          control={
            <Checkbox
              checked={showArchived}
              onChange={(e) => onToggleArchived(e.target.checked)}
              size="small"
              sx={{ py: 0 }}
            />
          }
          label={
            <Typography variant="caption" color="text.secondary">
              Show archived
            </Typography>
          }
          sx={{ m: 0 }}
        />
      </Box>
    </Box>
  );
};
