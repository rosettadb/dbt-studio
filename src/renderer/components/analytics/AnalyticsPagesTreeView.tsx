import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Tooltip,
  LinearProgress,
} from '@mui/material';
import {
  NoteAdd,
  CreateNewFolder,
  Description,
  Edit,
  Delete,
  Web as WebIcon,
  Language as LanguageIcon,
  FolderOpen as FolderOpenIcon,
  OpenInBrowser as OpenInBrowserIcon,
  DeleteOutline,
} from '@mui/icons-material';
import {
  useGetAnalyticsPages,
  useCreateAnalyticsPage,
  useUpdateAnalyticsPage,
  useDeleteAnalyticsPage,
} from '../../controllers/analyticsPages.controller';
import {
  useGetStaticSiteState,
  useDeleteStaticSiteBuild,
} from '../../controllers/staticSite.controller';
import { buildAnalyticsTree } from '../../utils/analyticsTree';
import { AnalyticsPageItem } from './AnalyticsPageItem';
import { StaticSiteBuildDialog } from './StaticSiteBuildDialog';
import { StaticSiteService } from '../../services/staticSite.service';
import type {
  StaticSiteBuildProgress,
  StaticSiteState,
} from '../../../types/staticSite';

interface AnalyticsPagesTreeViewProps {
  connectionId: string;
  activePageId: string | null;
  onOpenPage: (pageId: string) => void;
  onDeletePage?: (pageId: string) => void;
}

type ContextMenuState = {
  mouseX: number;
  mouseY: number;
  pageId: string;
  title: string;
} | null;

export const AnalyticsPagesTreeView: React.FC<AnalyticsPagesTreeViewProps> = ({
  connectionId,
  activePageId,
  onOpenPage,
  onDeletePage,
}) => {
  const { data: pages = [], isLoading } = useGetAnalyticsPages(connectionId);
  const createPageMutation = useCreateAnalyticsPage();
  const updatePageMutation = useUpdateAnalyticsPage();
  const deletePageMutation = useDeleteAnalyticsPage();

  const treeNodes = useMemo(() => buildAnalyticsTree(pages), [pages]);

  // ── Static site state ─────────────────────────────────────────────────────
  const { data: siteState, refetch: refetchSiteState } =
    useGetStaticSiteState(connectionId);
  const [buildDialogOpen, setBuildDialogOpen] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildProgress, setBuildProgress] =
    useState<StaticSiteBuildProgress | null>(null);
  const [lastSuccessState, setLastSuccessState] =
    useState<StaticSiteState | null>(null);
  const [deleteSiteDialogOpen, setDeleteSiteDialogOpen] = useState(false);
  const deleteSiteMutation = useDeleteStaticSiteBuild();

  // Subscribe to streaming progress events (FE-03 — subscription in service)
  useEffect(() => {
    if (!isBuilding) return undefined;
    return StaticSiteService.subscribeToBuildProgress((p) => {
      setBuildProgress(p);
      if (p.phase === 'done' || p.phase === 'error') {
        setIsBuilding(false);
      }
    });
  }, [isBuilding]);

  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

  // Dialog state: Create Page / Folder
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newRoutePath, setNewRoutePath] = useState('');
  const [isFolderMode, setIsFolderMode] = useState(false);

  // Dialog state: Rename Page
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renamePageId, setRenamePageId] = useState('');
  const [renameTitle, setRenameTitle] = useState('');

  // Dialog state: Delete Page
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletePageId, setDeletePageId] = useState('');
  const [deleteTitle, setDeleteTitle] = useState('');

  // Context Menu Handlers
  const handleContextMenu = useCallback(
    (event: React.MouseEvent, pageId: string, title: string) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({
        mouseX: event.clientX,
        mouseY: event.clientY,
        pageId,
        title,
      });
    },
    [],
  );

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleMenuAction = useCallback(
    (action: 'open' | 'rename' | 'delete') => {
      if (!contextMenu) return;

      switch (action) {
        case 'open':
          onOpenPage(contextMenu.pageId);
          break;
        case 'rename':
          setRenamePageId(contextMenu.pageId);
          setRenameTitle(contextMenu.title);
          setRenameDialogOpen(true);
          break;
        case 'delete':
          setDeletePageId(contextMenu.pageId);
          setDeleteTitle(contextMenu.title);
          setDeleteDialogOpen(true);
          break;
        default:
          break;
      }
      handleCloseContextMenu();
    },
    [contextMenu, onOpenPage, handleCloseContextMenu],
  );

  // Create Handlers
  const handleOpenCreateDialog = (folderMode = false) => {
    setIsFolderMode(folderMode);
    setNewTitle('');
    setNewRoutePath(folderMode ? '/new-folder/' : '/');
    setCreateDialogOpen(true);
  };

  const handleCreateSubmit = () => {
    if (!newTitle.trim() || !newRoutePath.trim()) return;

    // ensure route path starts with /
    const route = newRoutePath.startsWith('/')
      ? newRoutePath
      : `/${newRoutePath}`;

    createPageMutation.mutate(
      {
        connectionId,
        data: {
          title: newTitle,
          routePath: route,
          markdownContent: `---\ntitle: ${newTitle}\n---\n\nStart building your analytics page here.`,
        },
      },
      {
        onSuccess: (newPage: { id: string }) => {
          setCreateDialogOpen(false);
          onOpenPage(newPage.id);
        },
      },
    );
  };

  // Auto-generate route based on title when title changes, if route hasn't been heavily manually edited
  const handleTitleChange = (val: string) => {
    setNewTitle(val);
    const slug = val
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');

    if (isFolderMode) {
      setNewRoutePath(`/${slug}/overview`);
    } else {
      setNewRoutePath(`/${slug}`);
    }
  };

  // Rename Handlers
  const handleRenameSubmit = () => {
    if (!renameTitle.trim() || !renamePageId) return;

    const page = pages.find((p) => p.id === renamePageId);
    let newMarkdown = page?.markdownContent ?? '';

    if (newMarkdown.startsWith('---')) {
      const endOfFrontmatter = newMarkdown.indexOf('---', 3);
      if (endOfFrontmatter > 3) {
        const frontmatter = newMarkdown.substring(0, endOfFrontmatter + 3);
        const restOfDoc = newMarkdown.substring(endOfFrontmatter + 3);

        if (/\ntitle:/.test(frontmatter)) {
          const updatedFrontmatter = frontmatter.replace(
            /\ntitle:[^\n]*/,
            `\ntitle: ${renameTitle}`,
          );
          newMarkdown = updatedFrontmatter + restOfDoc;
        } else {
          const updatedFrontmatter = frontmatter.replace(
            /\n---$/,
            `\ntitle: ${renameTitle}\n---`,
          );
          newMarkdown = updatedFrontmatter + restOfDoc;
        }
      }
    }

    updatePageMutation.mutate(
      {
        connectionId,
        pageId: renamePageId,
        updates: {
          title: renameTitle,
          markdownContent: newMarkdown,
        },
      },
      {
        onSuccess: () => {
          setRenameDialogOpen(false);
        },
      },
    );
  };

  // Delete Handlers
  const handleDeleteSubmit = () => {
    if (!deletePageId) return;

    deletePageMutation.mutate(
      { connectionId, pageId: deletePageId },
      {
        onSuccess: () => {
          setDeleteDialogOpen(false);
          if (onDeletePage) onDeletePage(deletePageId);
        },
      },
    );
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1,
          borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WebIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
          <Typography variant="body2" fontWeight={600} color="text.primary">
            Pages
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title="Create Folder">
            <IconButton
              size="small"
              onClick={() => handleOpenCreateDialog(true)}
            >
              <CreateNewFolder sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Create Page">
            <IconButton
              size="small"
              onClick={() => handleOpenCreateDialog(false)}
            >
              <NoteAdd sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Build Static Site">
            <IconButton
              size="small"
              onClick={() => setBuildDialogOpen(true)}
              disabled={isBuilding}
              color={isBuilding ? 'primary' : 'default'}
            >
              <LanguageIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Inline build progress (shown while building) */}
      {isBuilding && buildProgress && (
        <Box
          sx={{
            px: 2,
            py: 1.5,
            borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 0.75,
          }}
        >
          <LinearProgress
            variant={
              buildProgress.current !== undefined && buildProgress.total
                ? 'determinate'
                : 'indeterminate'
            }
            value={
              buildProgress.current !== undefined && buildProgress.total
                ? Math.round(
                    (buildProgress.current / buildProgress.total) * 100,
                  )
                : undefined
            }
          />
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: '0.7rem', lineHeight: 1.4 }}
          >
            {buildProgress.message}
          </Typography>
        </Box>
      )}

      {/* Tree Content */}
      <Box sx={{ flex: 1, overflow: 'auto', py: 1 }}>
        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress size={24} />
          </Box>
        )}
        {!isLoading && treeNodes.length === 0 && (
          <Box
            sx={{ textAlign: 'center', px: 2, py: 4, color: 'text.secondary' }}
          >
            <NoteAdd sx={{ fontSize: 40, opacity: 0.3, mb: 2 }} />
            <Typography
              variant="body2"
              sx={{ whiteSpace: 'normal', wordBreak: 'break-word' }}
            >
              No analytics pages yet. Click + to create your first dashboard.
            </Typography>
          </Box>
        )}
        {!isLoading &&
          treeNodes.length > 0 &&
          treeNodes.map((node: any, index: number) => (
            <AnalyticsPageItem
              key={`${node.routePath}-${index}`}
              node={node}
              depth={0}
              activePageId={activePageId}
              onOpenPage={onOpenPage}
              onRenamePage={(id, title) => {
                setRenamePageId(id);
                setRenameTitle(title);
                setRenameDialogOpen(true);
              }}
              onDeletePage={(id, title) => {
                setDeletePageId(id);
                setDeleteTitle(title);
                setDeleteDialogOpen(true);
              }}
              onContextMenu={handleContextMenu}
            />
          ))}
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
        <Divider sx={{ my: 0.25 }} />
        <MenuItem
          onClick={() => handleMenuAction('delete')}
          sx={{ color: 'error.main', fontSize: '0.75rem', py: 0.5, px: 1 }}
        >
          <ListItemIcon sx={{ minWidth: 28 }}>
            <Delete fontSize="small" sx={{ color: 'error.main' }} />
          </ListItemIcon>
          <ListItemText
            primary="Delete"
            primaryTypographyProps={{ fontSize: '0.75rem' }}
          />
        </MenuItem>
      </Menu>

      {/* Create Dialog */}
      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {isFolderMode ? 'Create Folder / Nested Page' : 'Create Page'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              autoFocus
              label="Title"
              fullWidth
              value={newTitle}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="e.g. Sales Performance"
              required
            />
            <TextField
              label="Route Path"
              fullWidth
              value={newRoutePath}
              onChange={(e) => setNewRoutePath(e.target.value)}
              placeholder="e.g. /sales-performance"
              required
              helperText="Must start with a forward slash (/)"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleCreateSubmit}
            variant="contained"
            disabled={
              !newTitle.trim() ||
              !newRoutePath.trim() ||
              createPageMutation.isLoading
            }
          >
            {createPageMutation.isLoading ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog
        open={renameDialogOpen}
        onClose={() => setRenameDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Rename Page</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <TextField
              autoFocus
              label="New Title"
              fullWidth
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              placeholder="Enter new title"
              required
              onKeyPress={(e) => {
                if (e.key === 'Enter') handleRenameSubmit();
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleRenameSubmit}
            variant="contained"
            disabled={!renameTitle.trim() || updatePageMutation.isLoading}
          >
            {updatePageMutation.isLoading ? 'Renaming...' : 'Rename'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Delete Page</DialogTitle>
        <DialogContent>
          Are you sure you want to delete the analytics page &quot;{deleteTitle}
          &quot;? This action cannot be undone.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleDeleteSubmit}
            color="error"
            variant="contained"
            disabled={deletePageMutation.isLoading}
          >
            {deletePageMutation.isLoading ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Build Site Dialog */}
      <StaticSiteBuildDialog
        open={buildDialogOpen}
        connectionId={connectionId}
        connectionName={connectionId}
        pageCount={pages.length}
        existingState={siteState ?? lastSuccessState}
        onClose={() => setBuildDialogOpen(false)}
        onBuildSuccess={(result) => {
          setBuildDialogOpen(false);
          setLastSuccessState({
            connectionId,
            lastBuildPath: result.outputPath,
            lastBuildAt: new Date().toISOString(),
            lastBuildPageCount: result.pageCount,
            lastBuildQueryCount: result.queryCount,
          });
          refetchSiteState();
        }}
      />

      {/* Open Folder / Preview actions — shown when a previous build exists */}
      {(siteState ?? lastSuccessState) && !isBuilding && (
        <Box
          sx={{
            px: 1.5,
            py: 1,
            borderTop: (theme) => `1px solid ${theme.palette.divider}`,
            display: 'flex',
            gap: 0.5,
          }}
        >
          <Tooltip
            title={`Open site folder: ${(siteState ?? lastSuccessState)!.lastBuildPath}`}
          >
            <Button
              size="small"
              variant="text"
              startIcon={<FolderOpenIcon sx={{ fontSize: 14 }} />}
              sx={{
                fontSize: '0.7rem',
                py: 0.25,
                textTransform: 'none',
                flex: 1,
              }}
              onClick={() =>
                StaticSiteService.openFolder(
                  (siteState ?? lastSuccessState)!.lastBuildPath,
                )
              }
            >
              Open Site Folder
            </Button>
          </Tooltip>
          <Tooltip title="Preview site in browser">
            <IconButton
              size="small"
              onClick={() =>
                StaticSiteService.openPreview(
                  (siteState ?? lastSuccessState)!.lastBuildPath,
                )
              }
            >
              <OpenInBrowserIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete build">
            <IconButton
              size="small"
              color="error"
              onClick={() => setDeleteSiteDialogOpen(true)}
            >
              <DeleteOutline sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </Box>
      )}

      {/* Delete Site Build Confirmation Dialog */}
      <Dialog
        open={deleteSiteDialogOpen}
        onClose={() => setDeleteSiteDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <DeleteOutline color="error" /> Delete site build?
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            This will permanently delete all files at:
          </Typography>
          <Box
            sx={{
              px: 1.5,
              py: 1,
              bgcolor: 'action.hover',
              borderRadius: 1,
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              wordBreak: 'break-all',
              mb: 2,
            }}
          >
            {(siteState ?? lastSuccessState)?.lastBuildPath}
          </Box>
          <Typography variant="body2" color="text.secondary">
            This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteSiteDialogOpen(false)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            disabled={deleteSiteMutation.isLoading}
            onClick={() => {
              const path = (siteState ?? lastSuccessState)?.lastBuildPath;
              if (path) {
                deleteSiteMutation.mutate(
                  { connectionId, outputPath: path },
                  {
                    onSuccess: () => {
                      setLastSuccessState(null);
                      setDeleteSiteDialogOpen(false);
                      refetchSiteState();
                    },
                  },
                );
              }
            }}
          >
            {deleteSiteMutation.isLoading ? 'Deleting...' : 'Delete Build'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
