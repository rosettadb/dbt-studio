/* eslint-disable react/jsx-props-no-spreading */
import React, { useMemo, useState, useCallback, useRef } from 'react';
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
  Description,
  Delete,
  Restore,
  Edit,
  FileCopy,
} from '@mui/icons-material';
import { NodeApi, NodeRendererProps, Tree, TreeApi } from 'react-arborist';
import { Notebook } from '../../../types/notebooks';
import { TREE_INDENT, TreeNode } from '../fileTreeViewer/TreeNode';
import type { FileNode, FileStatuses } from '../fileTreeViewer/types';
import { useFitTreeHeight } from '../fileTreeViewer/useFitTreeHeight';

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
  getConnectionName: (connectionKey: string) => string;
  /** Label of the folder holding the notebooks (default "My Notebooks"). */
  rootLabel?: string;
  /** Text when there are no notebooks and no filter. */
  emptyText?: string;
  /** Id of the notebook in the active tab, highlighted in the tree. */
  activeNotebookId?: string;
  /** Opens the create dialog for a notebook saved in Studio. */
  onCreateNotebook?: () => void;
}

type ContextMenuState = {
  mouseX: number;
  mouseY: number;
  notebookId: string;
  notebookName: string;
  isArchived: boolean;
  connectionKey?: string;
} | null;

// Node ids. Active notebooks use their own id; the rest are prefixed so they
// can't collide with one.
const ROOT_ID = 'studio-notebooks';
const ARCHIVED_ID = 'studio-notebooks-archived';
const ARCHIVED_GROUP_PREFIX = 'studio-notebooks-archived-group:';
const ARCHIVED_ITEM_PREFIX = 'studio-notebooks-archived-item:';
const ROW_HEIGHT = 22;
const NO_GIT_STATUSES: FileStatuses = {};

/** A tree row's notebook; `archivedIn` is the connection key of an archived one. */
type NotebookEntry = { notebook: Notebook; archivedIn?: string };

// The file name the row shows; its extension also picks the file icon, as
// in the project file tree
const notebookFileName = (notebook: Notebook) =>
  `${notebook.name}${notebook.kind === 'python' ? '.ipynb' : '.sql'}`;

/**
 * Notebooks saved in Studio (app data, not a project folder), drawn with the
 * project file tree's rows so both lists look the same. They aren't files, so
 * the rows have no file actions: open, rename, duplicate and delete go
 * through the right-click menu as before.
 */
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
  getConnectionName,
  rootLabel = 'My Notebooks',
  emptyText = 'No notebooks yet. Click the + button to create one.',
  activeNotebookId,
  onCreateNotebook,
}) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

  const treeRef = useRef<TreeApi<FileNode> | null>(null);

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

  const archivedGroups = useMemo(
    () => (showArchived ? Object.entries(filteredArchivedNotebooks) : []),
    [showArchived, filteredArchivedNotebooks],
  );
  const isEmpty = filteredNotebooks.length === 0 && archivedGroups.length === 0;

  // The root folder with the notebooks, then an Archived folder with one
  // subfolder per connection
  const { treeData, entries } = useMemo(() => {
    const byNodeId = new Map<string, NotebookEntry>();
    const fileNode = (
      id: string,
      notebook: Notebook,
      archivedIn?: string,
    ): FileNode => {
      byNodeId.set(id, { notebook, archivedIn });
      return { id, name: notebookFileName(notebook), path: id, type: 'file' };
    };

    const data: FileNode[] = [
      {
        id: ROOT_ID,
        name: rootLabel,
        path: ROOT_ID,
        type: 'folder',
        children: filteredNotebooks.map((n) => fileNode(n.id, n)),
      },
    ];
    if (archivedGroups.length > 0) {
      data.push({
        id: ARCHIVED_ID,
        name: 'Archived',
        path: ARCHIVED_ID,
        type: 'folder',
        children: archivedGroups.map(([connectionKey, list]) => ({
          id: `${ARCHIVED_GROUP_PREFIX}${connectionKey}`,
          name: `${getConnectionName(connectionKey)} (${list.length})`,
          path: `${ARCHIVED_GROUP_PREFIX}${connectionKey}`,
          type: 'folder',
          children: list.map((n) =>
            fileNode(`${ARCHIVED_ITEM_PREFIX}${n.id}`, n, connectionKey),
          ),
        })),
      });
    }
    return { treeData: data, entries: byNodeId };
  }, [rootLabel, filteredNotebooks, archivedGroups, getConnectionName]);

  // As tall as its visible rows, so it sits right under the project tree and
  // the Notebooks tab scrolls both
  const fitHeight = useFitTreeHeight(treeRef, ROW_HEIGHT, treeData);

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

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: FileNode) => {
      event.preventDefault();
      const entry = entries.get(node.id);
      if (!entry) return;
      handleContextMenu(
        event,
        entry.notebook.id,
        entry.notebook.name,
        !!entry.archivedIn,
        entry.archivedIn,
      );
    },
    [entries, handleContextMenu],
  );

  // A click on an active notebook opens it; archived ones open from the menu
  const handleSelect = useCallback(
    (nodes: NodeApi<FileNode>[]) => {
      const node = nodes[0];
      if (!node || node.data.type !== 'file') return;
      const entry = entries.get(node.data.id);
      if (!entry || entry.archivedIn) return;
      if (entry.notebook.id !== activeNotebookId) {
        onOpenNotebook(entry.notebook.id);
      }
    },
    [entries, activeNotebookId, onOpenNotebook],
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

  return (
    <Box>
      {/* No focus ring on the clicked row; the selection highlight shows it */}
      <Box
        data-testid="studio-notebooks-tree"
        sx={{
          pl: '4px',
          '& [role="treeitem"]:focus': { outline: 'none' },
        }}
      >
        <Tree<FileNode>
          ref={treeRef}
          data={treeData}
          idAccessor="id"
          openByDefault={false}
          initialOpenState={{ [ROOT_ID]: true, [ARCHIVED_ID]: true }}
          width="100%"
          height={fitHeight.height}
          indent={TREE_INDENT}
          rowHeight={ROW_HEIGHT}
          overscanCount={10}
          disableDrag
          disableDrop
          disableEdit
          selection={activeNotebookId}
          onSelect={handleSelect}
          onToggle={fitHeight.onToggle}
        >
          {(props: NodeRendererProps<FileNode>) => (
            <TreeNode
              {...props}
              fileStatuses={NO_GIT_STATUSES}
              onContextMenu={handleNodeContextMenu}
              projectPath={ROOT_ID}
              // New notebook from the root folder's hover button only
              onCreateFile={
                onCreateNotebook && props.node.id === ROOT_ID
                  ? () => onCreateNotebook()
                  : undefined
              }
            />
          )}
        </Tree>
      </Box>

      {isEmpty && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            px: 2,
            py: 1,
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
            whiteSpace: 'normal',
          }}
        >
          {filter ? 'No notebooks match your filter' : emptyText}
        </Typography>
      )}

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
    </Box>
  );
};
