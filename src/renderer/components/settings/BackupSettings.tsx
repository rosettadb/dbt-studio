import React from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Checkbox,
  FormControlLabel,
  FormGroup,
  TextField,
  Alert,
  Divider,
  CircularProgress,
  InputAdornment,
  IconButton,
  Chip,
  LinearProgress,
} from '@mui/material';
import {
  BackupOutlined,
  RestoreOutlined,
  LockOutlined,
  Visibility,
  VisibilityOff,
  CheckCircleOutline,
  FolderZip,
  CancelOutlined,
  WarningAmberOutlined,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useQueryClient } from 'react-query';
import { QUERY_KEYS } from '../../config/constants';
import { cloudExplorerKeys } from '../../controllers/cloudExplorer.controller';

type BackupCategory =
  | 'projects'
  | 'connections'
  | 'datalake'
  | 'sources'
  | 'notebooks'
  | 'settings'
  | 'secretStore'
  | 'savedQueries'
  | 'analytics'
  | 'aiProviders';

interface CategoryConfig {
  key: BackupCategory;
  label: string;
  description: string;
}

const CATEGORIES: CategoryConfig[] = [
  {
    key: 'projects',
    label: 'Projects',
    description: 'Project metadata and configuration references',
  },
  {
    key: 'notebooks',
    label: 'Notebooks',
    description: 'All notebook files with their cell contents',
  },
  {
    key: 'connections',
    label: 'Connections',
    description: 'dbt Core and dbt Cloud connection profiles',
  },
  {
    key: 'datalake',
    label: 'Data Lakes',
    description: 'Iceberg and DuckLake engine configurations',
  },
  {
    key: 'sources',
    label: 'Cloud Sources',
    description: 'Cloud Explorer connections (S3, GCS, Azure, etc.)',
  },
  {
    key: 'savedQueries',
    label: 'SQL Queries',
    description: 'SQL queries saved in the SQL Editor',
  },
  {
    key: 'analytics',
    label: 'Analytics',
    description: 'Custom analytics pages and charts',
  },
  {
    key: 'aiProviders',
    label: 'AI Providers',
    description: 'AI model connections (OpenAI, Anthropic, etc.)',
  },
  {
    key: 'settings',
    label: 'Settings',
    description: 'Application settings (paths, versions, preferences)',
  },
  {
    key: 'secretStore',
    label: 'Secret Store',
    description:
      'Keystore credentials — requires a password to encrypt securely',
  },
];

interface ImportResult {
  imported: Partial<Record<BackupCategory, number>>;
  skipped: string[];
  warnings: string[];
}

export const BackupSettings: React.FC = () => {
  const queryClient = useQueryClient();
  // ── Export state ────────────────────────────────────────────────────────────
  const [exportCategories, setExportCategories] = React.useState<
    Set<BackupCategory>
  >(
    new Set([
      'projects',
      'notebooks',
      'connections',
      'datalake',
      'sources',
      'savedQueries',
    ]),
  );
  const [exportPassword, setExportPassword] = React.useState('');
  const [showExportPassword, setShowExportPassword] = React.useState(false);
  const [exportTaskId, setExportTaskId] = React.useState<string | null>(null);
  const [exportProgress, setExportProgress] = React.useState<number>(0);
  const [lastExportPath, setLastExportPath] = React.useState<string | null>(
    null,
  );

  // ── Import state ────────────────────────────────────────────────────────────
  const [importPassword, setImportPassword] = React.useState('');
  const [showImportPassword, setShowImportPassword] = React.useState(false);
  const [importTaskId, setImportTaskId] = React.useState<string | null>(null);
  const [importProgress, setImportProgress] = React.useState<number>(0);
  const [importResult, setImportResult] = React.useState<ImportResult | null>(
    null,
  );
  const [importFilePath, setImportFilePath] = React.useState<string | null>(
    null,
  );
  const [selectedImportPath, setSelectedImportPath] = React.useState<
    string | null
  >(null);

  const exportTaskIdRef = React.useRef<string | null>(null);
  const importTaskIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    exportTaskIdRef.current = exportTaskId;
  }, [exportTaskId]);

  React.useEffect(() => {
    importTaskIdRef.current = importTaskId;
  }, [importTaskId]);

  const isExporting = exportTaskId !== null;
  const isImporting = importTaskId !== null;

  // ── Listen to task:event for progress, completion, failure, cancellation ──
  React.useEffect(() => {
    const unsubscribe = window.electron.ipcRenderer.on(
      'task:event',
      (event: any) => {
        const task = event?.task ?? event;

        if (task?.id === exportTaskIdRef.current) {
          if (task.progress?.percentage !== undefined) {
            setExportProgress(task.progress.percentage);
          }
          if (task.status === 'completed') {
            setExportTaskId(null);
            setExportProgress(100);
            toast.success(`Backup exported successfully!`);
          } else if (task.status === 'error') {
            setExportTaskId(null);
            setExportProgress(0);
            if (task.error && !task.error.includes('cancelled')) {
              toast.error(`Export failed: ${task.error}`);
            } else {
              toast.info('Export stopped.');
            }
          }
        }

        if (task?.id === importTaskIdRef.current) {
          if (task.progress?.percentage !== undefined) {
            setImportProgress(task.progress.percentage);
          }
          if (task.status === 'completed') {
            window.electron.ipcRenderer
              .invoke('backup:import:result', { taskId: task.id })
              .then((meta: any) => {
                setImportTaskId(null);
                setImportProgress(100);
                if (meta?.result) {
                  setImportResult(meta.result);
                  setImportFilePath(meta.filePath);
                  if (meta.result.warnings.length > 0) {
                    toast.warn(
                      `Import completed with ${meta.result.warnings.length} warning(s).`,
                    );
                  } else {
                    toast.success('Backup imported successfully!');
                  }
                }
                // Invalidate all caches so the dropdown and other views reflect imported data
                queryClient.invalidateQueries([QUERY_KEYS.GET_PROJECTS]);
                queryClient.invalidateQueries([QUERY_KEYS.GET_CONNECTIONS]);
                queryClient.invalidateQueries([QUERY_KEYS.GET_SETTINGS]);
                queryClient.invalidateQueries(cloudExplorerKeys.connections);
                return undefined;
              })
              .catch(() => {
                setImportTaskId(null);
                setImportProgress(0);
              });
          } else if (task.status === 'error') {
            setImportTaskId(null);
            setImportProgress(0);
            if (task.error && !task.error.includes('cancelled')) {
              toast.error(`Import failed: ${task.error}`);
            } else {
              toast.info('Import stopped.');
            }
          }
        }
      },
    );
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const secretStoreSelected = exportCategories.has('secretStore');

  const handleCategoryToggle = (key: BackupCategory) => {
    setExportCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleExport = async () => {
    if (exportCategories.size === 0) {
      toast.warn('Please select at least one category to export.');
      return;
    }
    if (secretStoreSelected && !exportPassword.trim()) {
      toast.warn('Please enter a password to encrypt the Secret Store.');
      return;
    }

    setLastExportPath(null);
    setExportProgress(0);
    try {
      const result = await window.electron.ipcRenderer.invoke('backup:export', {
        categories: Array.from(exportCategories),
        // Pass password whenever one is set (encrypts the whole ZIP, not just Secret Store)
        password: exportPassword.trim() || undefined,
      });

      if (result.canceled) return;

      setExportTaskId(result.taskId);
      setLastExportPath(result.filePath);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Export failed: ${message}`);
    }
  };

  const handleStopExport = async () => {
    if (!exportTaskId) return;
    try {
      await window.electron.ipcRenderer.invoke('task:cancel', {
        taskId: exportTaskId,
      });
      setExportTaskId(null);
      setExportProgress(0);
      toast.info('Export cancelled.');
    } catch {
      // ignore cancellation errors
    }
  };

  const handleSelectImportFile = async () => {
    try {
      const response = await window.electron.ipcRenderer.invoke(
        'backup:import:select',
      );
      if (response.canceled) return;
      setSelectedImportPath(response.filePath);
      // Reset previous results
      setImportResult(null);
      setImportFilePath(null);
      setImportProgress(0);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`File selection failed: ${message}`);
    }
  };

  const handleImport = async () => {
    if (!selectedImportPath) return;

    setImportResult(null);
    setImportFilePath(null);
    setImportProgress(0);
    try {
      const response = await window.electron.ipcRenderer.invoke(
        'backup:import',
        {
          filePath: selectedImportPath,
          password: importPassword || undefined,
        },
      );

      if (response.canceled) return;

      importTaskIdRef.current = response.taskId;
      setImportTaskId(response.taskId);

      // Poll immediately — catches the common case where the task finishes
      // (or fails) so fast that the task:event fired before the ref was set.
      const meta = await window.electron.ipcRenderer.invoke(
        'backup:import:result',
        { taskId: response.taskId },
      );

      if (meta?.status === 'completed' && meta?.result) {
        // Task already finished successfully
        setImportTaskId(null);
        setImportProgress(100);
        setImportResult(meta.result);
        setImportFilePath(meta.filePath);
        if (meta.result.warnings.length > 0) {
          toast.warn(
            `Import completed with ${meta.result.warnings.length} warning(s).`,
          );
        } else {
          toast.success('Backup imported successfully!');
        }
        // Invalidate all caches so the dropdown and other views reflect imported data
        queryClient.invalidateQueries([QUERY_KEYS.GET_PROJECTS]);
        queryClient.invalidateQueries([QUERY_KEYS.GET_CONNECTIONS]);
        queryClient.invalidateQueries([QUERY_KEYS.GET_SETTINGS]);
        queryClient.invalidateQueries(cloudExplorerKeys.connections);
      } else if (meta?.status === 'error' || meta?.status === 'cancelled') {
        // Task already failed — show the error immediately
        setImportTaskId(null);
        setImportProgress(0);
        if (meta.error && !meta.error.includes('cancelled')) {
          const isPasswordError =
            meta.error.includes('password') ||
            meta.error.includes('manifest') ||
            meta.error.includes('decrypt');
          if (isPasswordError) {
            toast.error(
              'This backup is password-protected. Please enter the correct decryption password.',
            );
          } else {
            toast.error(`Import failed: ${meta.error}`);
          }
        } else {
          toast.info('Import stopped.');
        }
      }
      // else: task is still running — task:event listener will handle progress/completion
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Import failed: ${message}`);
    }
  };

  const handleStopImport = async () => {
    if (!importTaskId) return;
    try {
      await window.electron.ipcRenderer.invoke('task:cancel', {
        taskId: importTaskId,
      });
      setImportTaskId(null);
      setImportProgress(0);
      toast.info('Import cancelled.');
    } catch {
      // ignore cancellation errors
    }
  };

  const importedTotal = importResult
    ? Object.values(importResult.imported).reduce(
        (sum, count) => sum + (count ?? 0),
        0,
      )
    : 0;

  return (
    <Box maxWidth={700} width="100%">
      <Typography variant="body2" color="text.secondary" mb={3}>
        Export your app data as an encrypted or plain ZIP archive, and restore
        from a previous backup. Only the categories you select will be included.
      </Typography>

      {/* ── Export Section ─────────────────────────────────────────────────── */}
      <Card
        variant="outlined"
        sx={{ mb: 3, borderRadius: 2, borderColor: 'divider' }}
      >
        <CardContent>
          <Box display="flex" alignItems="center" gap={1} mb={0.5}>
            <BackupOutlined color="primary" />
            <Typography variant="h6" sx={{ m: 0 }}>
              Export Backup
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Select what to include in the backup ZIP.
          </Typography>

          <FormGroup>
            {CATEGORIES.map(({ key, label, description }) => (
              <FormControlLabel
                key={key}
                sx={{
                  alignItems: 'flex-start',
                  mb: 0.5,
                  '& .MuiCheckbox-root': { pt: 0.5 },
                }}
                control={
                  <Checkbox
                    id={`backup-category-${key}`}
                    size="small"
                    checked={exportCategories.has(key)}
                    onChange={() => handleCategoryToggle(key)}
                  />
                }
                label={
                  <Box>
                    <Box display="flex" alignItems="center" gap={0.75}>
                      <Typography variant="body2" fontWeight={500}>
                        {label}
                      </Typography>
                      {key === 'secretStore' && (
                        <Chip
                          icon={<LockOutlined sx={{ fontSize: 12 }} />}
                          label="Encrypted"
                          size="small"
                          color="warning"
                          variant="outlined"
                          sx={{ height: 18, fontSize: '0.65rem' }}
                        />
                      )}
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {description}
                    </Typography>
                  </Box>
                }
              />
            ))}
          </FormGroup>

          {/* Password field — always visible; required when Secret Store selected, optional otherwise */}
          <Box mt={2}>
            {secretStoreSelected && (
              <Alert severity="warning" sx={{ mb: 1.5, borderRadius: 1 }}>
                The Secret Store contains sensitive credentials. A password is
                required to encrypt this data in the ZIP.
              </Alert>
            )}
            <TextField
              id="backup-export-password"
              label={
                secretStoreSelected
                  ? 'Encryption Password (required)'
                  : 'Encryption Password (optional — encrypts the whole ZIP)'
              }
              value={exportPassword}
              onChange={(e) => setExportPassword(e.target.value)}
              type={showExportPassword ? 'text' : 'password'}
              size="small"
              fullWidth
              required={secretStoreSelected}
              placeholder={
                secretStoreSelected
                  ? 'Enter a strong password…'
                  : 'Leave blank for no encryption'
              }
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => setShowExportPassword((v) => !v)}
                        edge="end"
                      >
                        {showExportPassword ? (
                          <VisibilityOff fontSize="small" />
                        ) : (
                          <Visibility fontSize="small" />
                        )}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
          </Box>

          <Box mt={2} display="flex" alignItems="center" gap={1.5}>
            <Button
              id="backup-export-btn"
              variant="contained"
              startIcon={
                isExporting ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  <FolderZip />
                )
              }
              onClick={handleExport}
              disabled={
                isExporting ||
                exportCategories.size === 0 ||
                (secretStoreSelected && !exportPassword.trim())
              }
            >
              {isExporting ? `Exporting (${exportProgress}%)` : 'Export ZIP'}
            </Button>

            {isExporting && (
              <Button
                variant="outlined"
                color="error"
                size="small"
                startIcon={<CancelOutlined fontSize="small" />}
                onClick={handleStopExport}
              >
                Stop
              </Button>
            )}

            {lastExportPath && !isExporting && (
              <Typography
                variant="caption"
                color="success.main"
                sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
              >
                <CheckCircleOutline sx={{ fontSize: 14 }} />
                Saved
              </Typography>
            )}
          </Box>

          {isExporting && (
            <Box mt={2}>
              <Box display="flex" justifyContent="space-between" mb={0.5}>
                <Typography variant="caption" color="text.secondary">
                  Exporting data…
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {exportProgress}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={exportProgress}
                sx={{ borderRadius: 1, height: 6 }}
              />
            </Box>
          )}
        </CardContent>
      </Card>

      {/* ── Import Section ─────────────────────────────────────────────────── */}
      <Card variant="outlined" sx={{ borderRadius: 2, borderColor: 'divider' }}>
        <CardContent>
          <Box display="flex" alignItems="center" gap={1} mb={0.5}>
            <RestoreOutlined color="primary" />
            <Typography variant="h6" sx={{ m: 0 }}>
              Import Backup
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Restore data from a previously exported backup ZIP. Existing items
            with matching IDs will not be overwritten.
          </Typography>

          <TextField
            id="backup-import-password"
            label="Decryption Password (if backup has Secret Store)"
            value={importPassword}
            onChange={(e) => setImportPassword(e.target.value)}
            type={showImportPassword ? 'text' : 'password'}
            size="small"
            fullWidth
            placeholder="Leave blank if backup has no Secret Store"
            sx={{ mb: 2 }}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => setShowImportPassword((v) => !v)}
                      edge="end"
                    >
                      {showImportPassword ? (
                        <VisibilityOff fontSize="small" />
                      ) : (
                        <Visibility fontSize="small" />
                      )}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />

          <Box display="flex" alignItems="center" gap={1.5} mb={2}>
            <Button
              id="backup-import-select-btn"
              variant="outlined"
              startIcon={<FolderZip />}
              onClick={handleSelectImportFile}
              disabled={isImporting}
            >
              Select Backup File
            </Button>

            {selectedImportPath && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '300px',
                }}
              >
                {selectedImportPath.split('/').pop() ?? selectedImportPath}
              </Typography>
            )}
          </Box>

          <Box display="flex" alignItems="center" gap={1.5}>
            <Button
              id="backup-import-btn"
              variant="contained"
              startIcon={
                isImporting ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  <RestoreOutlined />
                )
              }
              onClick={handleImport}
              disabled={isImporting || !selectedImportPath}
            >
              {isImporting ? `Importing (${importProgress}%)` : 'Import'}
            </Button>

            {isImporting && (
              <Button
                variant="outlined"
                color="error"
                size="small"
                startIcon={<CancelOutlined fontSize="small" />}
                onClick={handleStopImport}
              >
                Stop
              </Button>
            )}
          </Box>

          {isImporting && (
            <Box mt={2}>
              <Box display="flex" justifyContent="space-between" mb={0.5}>
                <Typography variant="caption" color="text.secondary">
                  Restoring backup files…
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {importProgress}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={importProgress}
                sx={{ borderRadius: 1, height: 6 }}
              />
            </Box>
          )}

          {/* Import result summary */}
          {importResult && (
            <Box mt={2}>
              <Divider sx={{ mb: 1.5 }} />
              <Typography variant="subtitle2" gutterBottom>
                Import Results
                {importFilePath && (
                  <Typography
                    component="span"
                    variant="caption"
                    color="text.secondary"
                    ml={1}
                  >
                    from {importFilePath.split('/').pop()}
                  </Typography>
                )}
              </Typography>

              <Box display="flex" flexWrap="wrap" gap={1} mb={1.5}>
                {(
                  Object.entries(importResult.imported) as [
                    BackupCategory,
                    number,
                  ][]
                ).map(([category, count]) => (
                  <Chip
                    key={category}
                    icon={<CheckCircleOutline />}
                    label={`${CATEGORIES.find((c) => c.key === category)?.label ?? category}: ${count} imported`}
                    size="small"
                    color="success"
                    variant="outlined"
                  />
                ))}
                {importedTotal === 0 && importResult.warnings.length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    No new items found (all items already exist).
                  </Typography>
                )}
              </Box>

              {importResult.warnings.length > 0 && (
                <Box display="flex" flexDirection="column" gap={0.75}>
                  {importResult.warnings.map((w, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <Alert
                      key={i}
                      severity="warning"
                      icon={<WarningAmberOutlined fontSize="small" />}
                      sx={{ borderRadius: 1, py: 0.25 }}
                    >
                      <Typography variant="caption">{w}</Typography>
                    </Alert>
                  ))}
                </Box>
              )}
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};
