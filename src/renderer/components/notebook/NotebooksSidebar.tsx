import React, { useState, useCallback } from 'react';
import {
  Box,
  Checkbox,
  Divider,
  FormControlLabel,
  Tabs,
  Tab,
  IconButton,
  Tooltip,
  Typography,
  useTheme,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  TextField,
  InputAdornment,
} from '@mui/material';
import {
  TableChart,
  Description,
  Refresh,
  Add,
  Search,
  FileDownload,
  Upload,
  Close,
  InsertChart,
} from '@mui/icons-material';
import { SchemaTreeViewerWithSchema } from '../../screens/sql/SchemaTreeViewerWithSchema';
import { NotebooksTreeView } from './NotebooksTreeView';
import { PythonMonoIcon } from './NotebookKindIcon';
import { AnalyticsPagesTreeView } from '../analytics';
import { Table, SupportedConnectionTypes } from '../../../types/backend';
import { Notebook } from '../../../types/notebooks';
import type { SchemaTreeNodeRef } from '../schemaTreeViewer/types';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`notebooks-tabpanel-${index}`}
      aria-labelledby={`notebooks-tab-${index}`}
      style={{ height: '100%', overflow: 'auto' }}
    >
      {value === index && <Box sx={{ height: '100%' }}>{children}</Box>}
    </div>
  );
};

interface NotebooksSidebarProps {
  // Connection info
  connectionName: string;
  connectionType: SupportedConnectionTypes;

  // Schema data
  schema: Table[];
  isLoadingSchema: boolean;

  // Notebooks data
  notebooks: Notebook[];
  isLoadingNotebooks: boolean;

  // Archived notebooks
  archivedNotebooks: Record<string, Notebook[]>;
  showArchived: boolean;

  // Callbacks
  onRefresh: () => void;
  /** Opens the create dialog for the project's notebooks/ folder or Studio. */
  onCreateNotebook: (target?: 'project' | 'studio') => void;
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
  onExportAllNotebooks?: () => void;
  onExportSelected?: () => void;
  onImportAllNotebooks?: () => void;
  /** Import a Jupyter `.ipynb` file as a Python notebook */
  onImportPythonNotebook?: () => void;
  onTabChange?: (tabIndex: number) => void;

  // Analytics
  connectionId: string;
  activeAnalyticsPageId: string | null;
  onOpenAnalyticsPage: (pageId: string) => void;
  onDeleteAnalyticsPage?: (pageId: string) => void;

  // Helper functions
  getConnectionName: (connectionKey: string) => string;

  /** Right-click on a Data tree row (optional). */
  onSchemaContextMenu?: (
    event: React.MouseEvent<HTMLDivElement>,
    node: SchemaTreeNodeRef,
  ) => void;

  /**
   * Folder tree of the linked project's notebooks, given the search text.
   * When set, it opens the Notebooks tab and the notebooks above follow it
   * in a "Saved in Studio" folder.
   */
  renderProjectNotebooks?: (filter: string) => React.ReactNode;

  /** Id of the notebook in the active tab, highlighted in the list. */
  activeNotebookId?: string;

  /**
   * Name of the project the connection belongs to: the + menu then offers a
   * new notebook in its notebooks/ folder or in Studio.
   */
  linkedProjectName?: string;
}

export const NotebooksSidebar: React.FC<NotebooksSidebarProps> = ({
  connectionName,
  connectionType,
  schema,
  isLoadingSchema,
  notebooks,
  isLoadingNotebooks,
  archivedNotebooks,
  showArchived,
  onRefresh,
  onCreateNotebook,
  onOpenNotebook,
  onRenameNotebook,
  onDuplicateNotebook,
  onDeleteNotebook,
  onRestoreNotebook,
  onDeleteArchivedNotebook,
  onToggleArchived,
  getConnectionName,
  onExportAllNotebooks,
  onExportSelected,
  onImportAllNotebooks,
  onImportPythonNotebook,
  onTabChange,
  connectionId,
  activeAnalyticsPageId,
  onOpenAnalyticsPage,
  onDeleteAnalyticsPage,
  onSchemaContextMenu,
  renderProjectNotebooks,
  activeNotebookId,
  linkedProjectName,
}) => {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState(0);
  const [exportMenuAnchor, setExportMenuAnchor] = useState<null | HTMLElement>(
    null,
  );
  const [addMenuAnchor, setAddMenuAnchor] = useState<null | HTMLElement>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const handleTabChange = useCallback(
    (_event: React.SyntheticEvent, newValue: number) => {
      setActiveTab(newValue);
      onTabChange?.(newValue);
    },
    [onTabChange],
  );

  const handleExportMenuOpen = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      setExportMenuAnchor(event.currentTarget);
    },
    [],
  );

  const handleExportMenuClose = useCallback(() => {
    setExportMenuAnchor(null);
  }, []);

  const handleAddMenuOpen = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      setAddMenuAnchor(event.currentTarget);
    },
    [],
  );

  const handleAddMenuClose = useCallback(() => {
    setAddMenuAnchor(null);
  }, []);

  const handleExportAll = useCallback(() => {
    handleExportMenuClose();
    onExportAllNotebooks?.();
  }, [handleExportMenuClose, onExportAllNotebooks]);

  const handleExportSelected = useCallback(() => {
    handleExportMenuClose();
    onExportSelected?.();
  }, [handleExportMenuClose, onExportSelected]);

  const handleCreateNotebook = useCallback(
    (target: 'project' | 'studio' = 'project') => {
      handleAddMenuClose();
      onCreateNotebook(target);
    },
    [handleAddMenuClose, onCreateNotebook],
  );

  const handleImportAllNotebooks = useCallback(() => {
    handleAddMenuClose();
    onImportAllNotebooks?.();
  }, [handleAddMenuClose, onImportAllNotebooks]);

  const handleImportPythonNotebook = useCallback(() => {
    handleAddMenuClose();
    onImportPythonNotebook?.();
  }, [handleAddMenuClose, onImportPythonNotebook]);

  const handleSearchChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(event.target.value);
    },
    [],
  );

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        bgcolor: 'background.paper',
      }}
    >
      {/* Tabs */}
      <Box
        sx={{
          borderBottom: `1px solid ${theme.palette.divider}`,
          bgcolor: 'background.paper',
        }}
      >
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="fullWidth"
          sx={{
            minHeight: 40,
            '& .MuiTab-root': {
              minHeight: 40,
              fontSize: '0.75rem',
              textTransform: 'none',
              py: 0.5,
            },
          }}
        >
          <Tab
            icon={<PythonMonoIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            label="Notebooks"
            id="notebooks-tab-0"
            aria-controls="notebooks-tabpanel-0"
          />
          <Tab
            icon={<TableChart sx={{ fontSize: 16 }} />}
            iconPosition="start"
            label="Data"
            id="notebooks-tab-1"
            aria-controls="notebooks-tabpanel-1"
          />
          <Tab
            icon={<InsertChart sx={{ fontSize: 16 }} />}
            iconPosition="start"
            label="Analytics"
            id="notebooks-tab-2"
            aria-controls="notebooks-tabpanel-2"
          />
        </Tabs>
      </Box>

      {/* Action Buttons Bar */}
      <Box
        sx={{
          display: 'flex',
          gap: 0.5,
          p: 1,
          borderBottom: `1px solid ${theme.palette.divider}`,
          bgcolor: 'background.paper',
        }}
      >
        {/* Search Input - always visible */}
        <TextField
          fullWidth
          size="small"
          placeholder={
            activeTab === 0
              ? 'Search notebooks...'
              : 'Search tables, columns...'
          }
          value={searchQuery}
          onChange={handleSearchChange}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search sx={{ fontSize: 16, color: 'text.secondary' }} />
              </InputAdornment>
            ),
            endAdornment: searchQuery && (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  onClick={handleClearSearch}
                  aria-label="Clear search"
                  sx={{ width: 20, height: 20 }}
                >
                  <Close sx={{ fontSize: 14 }} />
                </IconButton>
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              height: 32,
              fontSize: '0.8rem',
              bgcolor: theme.palette.background.default,
            },
          }}
        />

        {/* Refresh Button */}
        <Tooltip title="Refresh">
          <IconButton
            size="small"
            onClick={onRefresh}
            sx={{
              width: 28,
              height: 28,
              bgcolor: 'transparent',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.05)' },
            }}
          >
            <Refresh sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        {/* Notebooks tab specific actions */}
        {activeTab === 0 && (
          <>
            <Tooltip title="Export">
              <IconButton
                size="small"
                onClick={handleExportMenuOpen}
                aria-controls="export-menu"
                aria-haspopup="true"
                sx={{
                  width: 28,
                  height: 28,
                  bgcolor: 'transparent',
                  '&:hover': { bgcolor: 'rgba(0,0,0,0.05)' },
                }}
              >
                <FileDownload sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Add">
              <IconButton
                size="small"
                onClick={handleAddMenuOpen}
                aria-controls="add-menu"
                aria-haspopup="true"
                sx={{
                  width: 28,
                  height: 28,
                  bgcolor: 'transparent',
                  '&:hover': { bgcolor: 'rgba(0,0,0,0.05)' },
                }}
              >
                <Add sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </>
        )}
      </Box>

      {/* Export Menu (for Notebooks tab) */}
      <Menu
        id="export-menu"
        anchorEl={exportMenuAnchor}
        open={Boolean(exportMenuAnchor)}
        onClose={handleExportMenuClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
      >
        <MenuItem onClick={handleExportAll}>
          <ListItemIcon>
            <FileDownload fontSize="small" />
          </ListItemIcon>
          <ListItemText>Export All Notebooks (JSON)</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleExportSelected} disabled>
          <ListItemIcon>
            <FileDownload fontSize="small" />
          </ListItemIcon>
          <ListItemText>Export Selected</ListItemText>
        </MenuItem>
      </Menu>

      {/* Add Menu (for Notebooks tab) */}
      <Menu
        id="add-menu"
        anchorEl={addMenuAnchor}
        open={Boolean(addMenuAnchor)}
        onClose={handleAddMenuClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
      >
        {linkedProjectName ? (
          [
            <MenuItem
              key="new-in-project"
              data-testid="notebooks-new-in-project"
              onClick={() => handleCreateNotebook('project')}
            >
              <ListItemIcon>
                <Description fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary={`New Notebook in ${linkedProjectName}`}
                secondary="Saved as a file in notebooks/"
                secondaryTypographyProps={{ fontSize: 11.5 }}
              />
            </MenuItem>,
            <MenuItem
              key="new-in-studio"
              data-testid="notebooks-new-in-studio"
              onClick={() => handleCreateNotebook('studio')}
            >
              <ListItemIcon>
                <Description fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary="New Notebook in Studio"
                secondary="Saved with this connection's notebooks"
                secondaryTypographyProps={{ fontSize: 11.5 }}
              />
            </MenuItem>,
          ]
        ) : (
          <MenuItem onClick={() => handleCreateNotebook('studio')}>
            <ListItemIcon>
              <Description fontSize="small" />
            </ListItemIcon>
            <ListItemText>Add New Notebook</ListItemText>
          </MenuItem>
        )}
        {linkedProjectName && <Divider />}
        <MenuItem onClick={handleImportAllNotebooks}>
          <ListItemIcon>
            <Upload fontSize="small" />
          </ListItemIcon>
          <ListItemText>Import Notebooks (JSON)</ListItemText>
        </MenuItem>
        {onImportPythonNotebook && (
          <MenuItem onClick={handleImportPythonNotebook}>
            <ListItemIcon>
              <Upload fontSize="small" />
            </ListItemIcon>
            <ListItemText>Import Jupyter Notebook (.ipynb)</ListItemText>
          </MenuItem>
        )}
      </Menu>

      {/* Tab Panels */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        {/* Notebooks Tab */}
        <TabPanel value={activeTab} index={0}>
          <Box
            sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}
          >
            {/* The project's notebooks folder, then the Studio notebooks
                right after it; both trees are as tall as their rows and
                scroll together */}
            <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', pt: 0.5 }}>
              {renderProjectNotebooks && (
                <>
                  {renderProjectNotebooks(searchQuery)}
                  <Divider sx={{ mt: 1.5, mb: 0.5 }} />
                </>
              )}
              <NotebooksTreeView
                notebooks={notebooks}
                isLoading={isLoadingNotebooks}
                archivedNotebooks={archivedNotebooks}
                showArchived={showArchived}
                onOpenNotebook={onOpenNotebook}
                onRenameNotebook={onRenameNotebook}
                onDuplicateNotebook={onDuplicateNotebook}
                onDeleteNotebook={onDeleteNotebook}
                onRestoreNotebook={onRestoreNotebook}
                onDeleteArchivedNotebook={onDeleteArchivedNotebook}
                getConnectionName={getConnectionName}
                filter={searchQuery}
                rootLabel={
                  renderProjectNotebooks ? 'Saved in Studio' : undefined
                }
                emptyText={
                  renderProjectNotebooks
                    ? 'No notebooks saved in Studio for this connection.'
                    : undefined
                }
                activeNotebookId={activeNotebookId}
                onCreateNotebook={() => onCreateNotebook('studio')}
              />
            </Box>

            {/* Show Archived Toggle, pinned under the list */}
            <Box
              sx={{
                px: 1,
                py: 0.5,
                borderTop: `1px solid ${theme.palette.divider}`,
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
        </TabPanel>

        {/* Data Tab */}
        <TabPanel value={activeTab} index={1}>
          <Box sx={{ height: '100%', overflow: 'auto', p: 1 }}>
            {isLoadingSchema && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  p: 2,
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  Loading schema...
                </Typography>
              </Box>
            )}
            {!isLoadingSchema && schema.length > 0 && (
              <SchemaTreeViewerWithSchema
                databaseName={connectionName}
                type={connectionType}
                schema={schema}
                isLoading={isLoadingSchema}
                filter={searchQuery}
                connectionId={connectionId}
                draggable
                onContextMenu={onSchemaContextMenu}
              />
            )}
            {!isLoadingSchema && schema.length === 0 && (
              <Box sx={{ p: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  No schema available
                </Typography>
              </Box>
            )}
          </Box>
        </TabPanel>

        {/* Analytics Tab */}
        <TabPanel value={activeTab} index={2}>
          <Box sx={{ height: '100%', overflow: 'hidden' }}>
            <AnalyticsPagesTreeView
              connectionId={connectionId}
              connectionName={connectionName}
              activePageId={activeAnalyticsPageId}
              onOpenPage={onOpenAnalyticsPage}
              onDeletePage={onDeleteAnalyticsPage}
            />
          </Box>
        </TabPanel>
      </Box>
    </Box>
  );
};
