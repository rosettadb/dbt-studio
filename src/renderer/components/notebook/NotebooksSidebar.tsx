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
  FormControl,
  Select,
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
  InsertChart,
  Link as LinkIcon,
  Code,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { SchemaTreeViewerWithSchema } from '../../screens/sql/SchemaTreeViewerWithSchema';
import { NotebooksTreeView } from './NotebooksTreeView';
import { JupyterSidebar } from './JupyterSidebar';
import { AnalyticsPagesTreeView } from '../analytics';
import { Table, SupportedConnectionTypes } from '../../../types/backend';
import { Notebook, PythonNotebook } from '../../../types/notebooks';
import connectionIcons, {
  defaultIcon,
} from '../../../../assets/connectionIcons';

// ─── TabPanel helper ──────────────────────────────────────────────────────────

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
  id?: string;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index, id }) => (
  <div
    role="tabpanel"
    hidden={value !== index}
    id={id ?? `sql-notebooks-tabpanel-${index}`}
    style={{ height: '100%', overflow: 'auto' }}
  >
    {value === index && <Box sx={{ height: '100%' }}>{children}</Box>}
  </div>
);

// ─── Connection selector types ────────────────────────────────────────────────

interface ConnectionItem {
  id: string;
  connection: { name: string; type: string };
}

interface DuckLakeItem {
  id: string;
  name: string;
}

interface ProjectItem {
  id: string;
  connectionId: string;
  name: string;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface NotebooksSidebarProps {
  // Connection selector (SQL sub-screen)
  connections: ConnectionItem[];
  duckLakeInstances: DuckLakeItem[];
  projects?: ProjectItem[];
  selectedProjectId?: string;
  activeConnectionId: string;
  onConnectionSelect: (connectionId: string) => void;

  // Connection info (for schema/tree rendering)
  connectionName: string;
  connectionType: SupportedConnectionTypes;

  // Schema data
  schema: Table[];
  isLoadingSchema: boolean;

  // SQL Notebooks data
  notebooks: Notebook[];
  isLoadingNotebooks: boolean;
  archivedNotebooks: Record<string, Notebook[]>;
  showArchived: boolean;

  // SQL Notebook callbacks
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
  /** Reports the active SQL inner sub-tab (0=Notebooks, 1=Data, 2=Analytics) */
  onTabChange?: (tabIndex: number) => void;

  // Analytics
  connectionId: string;
  activeAnalyticsPageId: string | null;
  onOpenAnalyticsPage: (pageId: string) => void;
  onDeleteAnalyticsPage?: (pageId: string) => void;

  // Helper functions
  getConnectionName: (connectionKey: string) => string;

  // Jupyter / Python sub-screen
  pythonNotebooks: PythonNotebook[];
  isLoadingPythonNotebooks: boolean;
  onCreatePythonNotebook: () => void;
  onOpenPythonNotebook: (notebookId: string) => void;
  onRenamePythonNotebook: (notebookId: string, currentName: string) => void;
  onDuplicatePythonNotebook: (notebookId: string, currentName: string) => void;
  onDeletePythonNotebook: (notebookId: string, notebookName: string) => void;
  onRefreshPythonNotebooks?: () => void;
  onExportPythonNotebook?: () => void;
  onImportPythonNotebook?: () => void;
  canExportPythonNotebook?: boolean;

  /** Controlled primary tab index (0=SQL, 1=Jupyter) — lifted to parent */
  activePrimaryTab: number;
  onPrimaryTabChange: (tab: number) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const NotebooksSidebar: React.FC<NotebooksSidebarProps> = ({
  connections,
  duckLakeInstances,
  projects,
  selectedProjectId,
  activeConnectionId,
  onConnectionSelect,
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
  onTabChange,
  connectionId,
  activeAnalyticsPageId,
  onOpenAnalyticsPage,
  onDeleteAnalyticsPage,
  pythonNotebooks,
  isLoadingPythonNotebooks,
  onCreatePythonNotebook,
  onOpenPythonNotebook,
  onRenamePythonNotebook,
  onDuplicatePythonNotebook,
  onDeletePythonNotebook,
  onRefreshPythonNotebooks,
  onExportPythonNotebook,
  onImportPythonNotebook,
  canExportPythonNotebook,
  activePrimaryTab,
  onPrimaryTabChange,
}) => {
  const theme = useTheme();
  const navigate = useNavigate();

  // SQL inner sub-tabs: 0=Notebooks, 1=Data, 2=Analytics
  const [sqlSubTab, setSqlSubTab] = useState(0);

  const [exportMenuAnchor, setExportMenuAnchor] = useState<null | HTMLElement>(
    null,
  );
  const [addMenuAnchor, setAddMenuAnchor] = useState<null | HTMLElement>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const handlePrimaryTabChange = useCallback(
    (_: React.SyntheticEvent, v: number) => onPrimaryTabChange(v),
    [onPrimaryTabChange],
  );

  const handleSqlSubTabChange = useCallback(
    (_: React.SyntheticEvent, v: number) => {
      setSqlSubTab(v);
      onTabChange?.(v);
    },
    [onTabChange],
  );

  const handleExportMenuOpen = useCallback(
    (e: React.MouseEvent<HTMLElement>) => setExportMenuAnchor(e.currentTarget),
    [],
  );
  const handleExportMenuClose = useCallback(
    () => setExportMenuAnchor(null),
    [],
  );
  const handleAddMenuOpen = useCallback(
    (e: React.MouseEvent<HTMLElement>) => setAddMenuAnchor(e.currentTarget),
    [],
  );
  const handleAddMenuClose = useCallback(() => setAddMenuAnchor(null), []);

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
    (e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value),
    [],
  );
  const handleClearSearch = useCallback(() => setSearchQuery(''), []);

  const sharedTabSx = {
    minHeight: 36,
    '& .MuiTab-root': {
      minHeight: 36,
      fontSize: '0.75rem',
      textTransform: 'none' as const,
      py: 0.5,
    },
  };

  const iconBtnSx = {
    width: 28,
    height: 28,
    bgcolor: 'transparent',
    '&:hover': { bgcolor: 'rgba(0,0,0,0.05)' },
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        bgcolor: 'background.paper',
      }}
    >
      {/* ── Primary sub-screen tabs: SQL | Jupyter ────────────────────────── */}
      <Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Tabs
          value={activePrimaryTab}
          onChange={handlePrimaryTabChange}
          variant="fullWidth"
          sx={{
            minHeight: 40,
            '& .MuiTab-root': {
              minHeight: 40,
              fontSize: '0.75rem',
              textTransform: 'none',
              py: 0.5,
              fontWeight: 600,
            },
          }}
        >
          <Tab
            icon={<LibraryBooks sx={{ fontSize: 15 }} />}
            iconPosition="start"
            label="SQL"
            id="nb-primary-tab-sql"
            aria-controls="nb-primary-panel-sql"
          />
          <Tab
            icon={<Code sx={{ fontSize: 15 }} />}
            iconPosition="start"
            label="Jupyter"
            id="nb-primary-tab-jupyter"
            aria-controls="nb-primary-panel-jupyter"
          />
        </Tabs>
      </Box>

      {/* ══════════════════════════════════════════════════════════════════════
          SQL PANEL
      ══════════════════════════════════════════════════════════════════════ */}
      <TabPanel value={activePrimaryTab} index={0} id="nb-primary-panel-sql">
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Connection selector — always visible */}
          <Box
            sx={{
              p: '8px',
              display: 'flex',
              gap: '4px',
              alignItems: 'center',
              borderBottom: `1px solid ${theme.palette.divider}`,
              bgcolor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#f5f5f5',
            }}
          >
            <FormControl fullWidth size="small">
              <Select
                data-testid="notebooks-connection-select"
                value={activeConnectionId}
                onChange={(e) => onConnectionSelect(e.target.value)}
                displayEmpty
                renderValue={(selected) => {
                  if (!selected) return 'Select Connection';
                  const conn = connections.find((c) => c.id === selected);
                  if (conn) {
                    const icon =
                      connectionIcons.images[
                        conn.connection
                          .type as keyof typeof connectionIcons.images
                      ] || defaultIcon;
                    const linkedProject = projects?.find(
                      (p) => p.connectionId === conn.id,
                    );
                    return (
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          width: '100%',
                        }}
                      >
                        <img
                          src={icon}
                          alt=""
                          style={{
                            width: 14,
                            height: 14,
                            objectFit: 'contain',
                          }}
                        />
                        <span
                          style={{
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            flex: 1,
                          }}
                        >
                          {conn.connection.name}
                        </span>
                        {linkedProject && (
                          <Tooltip title={`Project: ${linkedProject.name}`}>
                            <LinkIcon
                              sx={{
                                ml: 'auto',
                                fontSize: 16,
                                color:
                                  linkedProject.id === selectedProjectId
                                    ? 'success.main'
                                    : 'text.disabled',
                                mr: 2,
                                transform: 'rotate(-45deg)',
                              }}
                            />
                          </Tooltip>
                        )}
                      </Box>
                    );
                  }
                  if (selected.startsWith('ducklake-')) {
                    const instanceId = selected.replace('ducklake-', '');
                    const instance = duckLakeInstances.find(
                      (inst) => inst.id === instanceId,
                    );
                    if (instance) {
                      return (
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            width: '100%',
                          }}
                        >
                          <img
                            src={connectionIcons.images.ducklake || defaultIcon}
                            alt=""
                            style={{
                              width: 14,
                              height: 14,
                              objectFit: 'contain',
                            }}
                          />
                          <span
                            style={{
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              flex: 1,
                            }}
                          >
                            {instance.name}
                          </span>
                        </Box>
                      );
                    }
                  }
                  return 'Select Connection';
                }}
                sx={{
                  height: 28,
                  bgcolor:
                    theme.palette.mode === 'dark' ? '#2d2d2d' : '#e0e0e0',
                  '& .MuiSelect-select': {
                    py: 0,
                    px: 1,
                    fontSize: '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                  },
                  '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                }}
              >
                <MenuItem value="" disabled sx={{ fontSize: '0.8rem' }}>
                  Select Connection
                </MenuItem>
                {connections.map((conn) => {
                  const linkedProject = projects?.find(
                    (p) => p.connectionId === conn.id,
                  );
                  return (
                    <MenuItem
                      key={conn.id}
                      value={conn.id}
                      sx={{
                        fontSize: '0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        justifyContent: 'space-between',
                      }}
                    >
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                      >
                        <img
                          src={
                            connectionIcons.images[
                              conn.connection
                                .type as keyof typeof connectionIcons.images
                            ] || defaultIcon
                          }
                          alt=""
                          style={{
                            width: 14,
                            height: 14,
                            objectFit: 'contain',
                          }}
                        />
                        {conn.connection.name}
                      </Box>
                      {linkedProject && (
                        <Tooltip title={`Project: ${linkedProject.name}`}>
                          <LinkIcon
                            sx={{
                              fontSize: 16,
                              color:
                                linkedProject.id === selectedProjectId
                                  ? 'success.main'
                                  : 'text.disabled',
                              transform: 'rotate(-45deg)',
                            }}
                          />
                        </Tooltip>
                      )}
                    </MenuItem>
                  );
                })}
                {duckLakeInstances.length > 0 && (
                  <MenuItem
                    disabled
                    sx={{ fontSize: '0.75rem', opacity: 0.6, mt: 1 }}
                  >
                    <strong>DuckLake Instances</strong>
                  </MenuItem>
                )}
                {duckLakeInstances.map((instance) => (
                  <MenuItem
                    key={`ducklake-${instance.id}`}
                    value={`ducklake-${instance.id}`}
                    sx={{
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                    }}
                  >
                    <img
                      src={connectionIcons.images.ducklake || defaultIcon}
                      alt=""
                      style={{ width: 14, height: 14, objectFit: 'contain' }}
                    />
                    {instance.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Tooltip title="Add Connection">
              <IconButton
                size="small"
                onClick={() => navigate('/app/add-connection')}
                sx={iconBtnSx}
              >
                <Add sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </Box>

          {/* SQL inner sub-tabs + panels — overlaid when no connection */}
          <Box
            sx={{
              flex: 1,
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* No-connection overlay */}
            {!activeConnectionId && (
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor:
                    theme.palette.mode === 'dark'
                      ? 'rgba(18,18,18,0.85)'
                      : 'rgba(245,245,245,0.88)',
                  backdropFilter: 'blur(2px)',
                  p: 2,
                  gap: 1,
                  textAlign: 'center',
                }}
              >
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontWeight: 500 }}
                >
                  Select a connection to view notebooks
                </Typography>
              </Box>
            )}

            {/* SQL inner sub-tabs: Notebooks | Data | Analytics */}
            <Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }}>
              <Tabs
                value={sqlSubTab}
                onChange={handleSqlSubTabChange}
                variant="fullWidth"
                sx={sharedTabSx}
              >
                <Tab
                  icon={<LibraryBooks sx={{ fontSize: 14 }} />}
                  iconPosition="start"
                  label="Notebooks"
                  id="sql-tab-0"
                  aria-controls="sql-tabpanel-0"
                />
                <Tab
                  icon={<TableChart sx={{ fontSize: 14 }} />}
                  iconPosition="start"
                  label="Data"
                  id="sql-tab-1"
                  aria-controls="sql-tabpanel-1"
                />
                <Tab
                  icon={<InsertChart sx={{ fontSize: 14 }} />}
                  iconPosition="start"
                  label="Analytics"
                  id="sql-tab-2"
                  aria-controls="sql-tabpanel-2"
                />
              </Tabs>
            </Box>

            {/* SQL action bar */}
            <Box
              sx={{
                display: 'flex',
                gap: 0.5,
                p: 1,
                borderBottom: `1px solid ${theme.palette.divider}`,
                bgcolor: 'background.paper',
              }}
            >
              <TextField
                fullWidth
                size="small"
                placeholder={
                  sqlSubTab === 0
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

              <Tooltip title="Refresh">
                <IconButton size="small" onClick={onRefresh} sx={iconBtnSx}>
                  <Refresh sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>

              {sqlSubTab === 0 && (
                <>
                  <Tooltip title="Export">
                    <IconButton
                      size="small"
                      onClick={handleExportMenuOpen}
                      aria-controls="sql-export-menu"
                      aria-haspopup="true"
                      sx={iconBtnSx}
                    >
                      <FileDownload sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Add">
                    <IconButton
                      size="small"
                      onClick={handleAddMenuOpen}
                      aria-controls="sql-add-menu"
                      aria-haspopup="true"
                      sx={iconBtnSx}
                    >
                      <Add sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                </>
              )}
            </Box>

            {/* SQL export menu */}
            <Menu
              id="sql-export-menu"
              anchorEl={exportMenuAnchor}
              open={Boolean(exportMenuAnchor)}
              onClose={handleExportMenuClose}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              transformOrigin={{ vertical: 'top', horizontal: 'left' }}
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

            {/* SQL add menu */}
            <Menu
              id="sql-add-menu"
              anchorEl={addMenuAnchor}
              open={Boolean(addMenuAnchor)}
              onClose={handleAddMenuClose}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              transformOrigin={{ vertical: 'top', horizontal: 'left' }}
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

            {/* SQL sub-tab panels */}
            <Box sx={{ flex: 1, overflow: 'hidden' }}>
              {/* Notebooks */}
              <TabPanel value={sqlSubTab} index={0} id="sql-tabpanel-0">
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

              {/* Data */}
              <TabPanel value={sqlSubTab} index={1} id="sql-tabpanel-1">
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

              {/* Analytics */}
              <TabPanel value={sqlSubTab} index={2} id="sql-tabpanel-2">
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
            {/* end no-connection wrapper */}
          </Box>
        </Box>
      </TabPanel>

      {/* ══════════════════════════════════════════════════════════════════════
          JUPYTER PANEL
      ══════════════════════════════════════════════════════════════════════ */}
      <TabPanel
        value={activePrimaryTab}
        index={1}
        id="nb-primary-panel-jupyter"
      >
        <Box sx={{ height: '100%' }}>
          <JupyterSidebar
            pythonNotebooks={pythonNotebooks}
            isLoading={isLoadingPythonNotebooks}
            onCreateNotebook={onCreatePythonNotebook}
            onOpenNotebook={onOpenPythonNotebook}
            onRenameNotebook={onRenamePythonNotebook}
            onDuplicateNotebook={onDuplicatePythonNotebook}
            onDeleteNotebook={onDeletePythonNotebook}
            onRefresh={onRefreshPythonNotebooks}
            onExportNotebook={onExportPythonNotebook}
            onImportNotebook={onImportPythonNotebook}
            canExportNotebook={canExportPythonNotebook}
          />
        </Box>
      </TabPanel>
    </Box>
  );
};
