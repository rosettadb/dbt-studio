import React, { useState, useCallback } from 'react';
import {
  Box,
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
  LibraryBooks,
  Refresh,
  Add,
  Search,
  FileDownload,
  Upload,
  Close,
} from '@mui/icons-material';
import { SchemaTreeViewerWithSchema } from '../../screens/sql/SchemaTreeViewerWithSchema';
import { NotebooksTreeView } from './NotebooksTreeView';
import { Table, SupportedConnectionTypes } from '../../../types/backend';
import { Notebook } from '../../../types/notebooks';

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
  onCreateNotebook: () => void;
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

  // Helper functions
  getConnectionName: (connectionKey: string) => string;
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
    },
    [],
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

  const handleCreateNotebook = useCallback(() => {
    handleAddMenuClose();
    onCreateNotebook();
  }, [handleAddMenuClose, onCreateNotebook]);

  const handleImportAllNotebooks = useCallback(() => {
    handleAddMenuClose();
    onImportAllNotebooks?.();
  }, [handleAddMenuClose, onImportAllNotebooks]);

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
            icon={<LibraryBooks sx={{ fontSize: 16 }} />}
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
        <MenuItem onClick={handleCreateNotebook}>
          <ListItemIcon>
            <Description fontSize="small" />
          </ListItemIcon>
          <ListItemText>Add New Notebook</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleImportAllNotebooks}>
          <ListItemIcon>
            <Upload fontSize="small" />
          </ListItemIcon>
          <ListItemText>Import Notebooks (JSON)</ListItemText>
        </MenuItem>
      </Menu>

      {/* Tab Panels */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        {/* Notebooks Tab */}
        <TabPanel value={activeTab} index={0}>
          <Box sx={{ height: '100%', overflow: 'auto', p: 1 }}>
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
              onToggleArchived={onToggleArchived}
              getConnectionName={getConnectionName}
              filter={searchQuery}
            />
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
      </Box>
    </Box>
  );
};
