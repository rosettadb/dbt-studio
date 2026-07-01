import React from 'react';
import {
  Box,
  Typography,
  IconButton,
  TextField,
  Button,
  Card,
  CardContent,
  InputAdornment,
  CircularProgress,
  Alert,
  Tooltip,
  Divider,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import {
  Delete,
  Visibility,
  VisibilityOff,
  Add,
  VpnKey,
  Close,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { secureStorageService } from '../../services/secureStorage.service';
import { SecureStorageAccount } from '../../../types/frontend';

type Entry = {
  key: string;
  visibleValue: string | null;
  loading: boolean;
};

export const KeystoreSettings: React.FC = () => {
  const [environments, setEnvironments] = React.useState<string[]>([]);
  const [activeEnv, setActiveEnv] = React.useState<string>('default');
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [newKey, setNewKey] = React.useState('');
  const [newValue, setNewValue] = React.useState('');
  const [showNewValue, setShowNewValue] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [addEnvOpen, setAddEnvOpen] = React.useState(false);
  const [newEnvName, setNewEnvName] = React.useState('');
  const [addEnvError, setAddEnvError] = React.useState('');
  const [deleteKeyTarget, setDeleteKeyTarget] = React.useState<string | null>(
    null,
  );
  const [deleteEnvTarget, setDeleteEnvTarget] = React.useState<string | null>(
    null,
  );
  const [isDeletingEnv, setIsDeletingEnv] = React.useState(false);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [keys, envs] = await Promise.all([
        secureStorageService.list(),
        secureStorageService.listEnvironments(),
      ]);
      setEntries(
        keys.sort().map((key) => ({ key, visibleValue: null, loading: false })),
      );
      setEnvironments(envs);
    } catch {
      toast.error('Failed to load keystore entries');
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const envEntries = React.useMemo(() => {
    if (activeEnv === 'default') {
      const envPrefixes = environments.map((e) => `${e}.`);
      return entries.filter(
        (e) => !envPrefixes.some((p) => e.key.startsWith(p)),
      );
    }
    const prefix = `${activeEnv}.`;
    return entries.filter((e) => e.key.startsWith(prefix));
  }, [entries, environments, activeEnv]);

  const displayKey = (key: string): string => {
    if (activeEnv === 'default') return key;
    return key.slice(`${activeEnv}.`.length);
  };

  const handleToggleReveal = async (key: string) => {
    const entry = entries.find((e) => e.key === key);
    if (!entry) return;
    if (entry.visibleValue !== null) {
      setEntries((prev) =>
        prev.map((e) => (e.key === key ? { ...e, visibleValue: null } : e)),
      );
      return;
    }
    setEntries((prev) =>
      prev.map((e) => (e.key === key ? { ...e, loading: true } : e)),
    );
    try {
      const value = await secureStorageService.get(key as SecureStorageAccount);
      setEntries((prev) =>
        prev.map((e) =>
          e.key === key
            ? { ...e, visibleValue: value ?? '', loading: false }
            : e,
        ),
      );
    } catch {
      setEntries((prev) =>
        prev.map((e) => (e.key === key ? { ...e, loading: false } : e)),
      );
      toast.error('Failed to reveal value');
    }
  };

  const handleDeleteKey = async () => {
    if (!deleteKeyTarget) return;
    try {
      await secureStorageService.delete(
        deleteKeyTarget as SecureStorageAccount,
      );
      setEntries((prev) => prev.filter((e) => e.key !== deleteKeyTarget));
      toast.success(`Deleted "${displayKey(deleteKeyTarget)}"`);
      setDeleteKeyTarget(null);
    } catch {
      toast.error(`Failed to delete "${displayKey(deleteKeyTarget)}"`);
    }
  };

  const handleAdd = async () => {
    if (!newKey.trim() || !newValue.trim()) return;
    const storedKey =
      activeEnv === 'default' ? newKey.trim() : `${activeEnv}.${newKey.trim()}`;
    setIsSaving(true);
    try {
      await secureStorageService.set(
        storedKey as SecureStorageAccount,
        newValue.trim(),
      );
      setNewKey('');
      setNewValue('');
      setShowNewValue(false);
      await load();
      toast.success('Entry saved');
    } catch {
      toast.error('Failed to save entry');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddEnv = async () => {
    const name = newEnvName.trim();
    if (!name) {
      setAddEnvError('Name is required');
      return;
    }
    if (name.includes('.')) {
      setAddEnvError('Environment name cannot contain "."');
      return;
    }
    if (name.toLowerCase() === 'default') {
      setAddEnvError('"default" is reserved');
      return;
    }
    if (environments.includes(name)) {
      setAddEnvError('Environment already exists');
      return;
    }
    const updated = [...environments, name];
    try {
      await secureStorageService.saveEnvironments(updated);
      setEnvironments(updated);
      setActiveEnv(name);
      setAddEnvOpen(false);
      setNewEnvName('');
      setAddEnvError('');
    } catch {
      toast.error('Failed to create environment');
    }
  };

  const handleDeleteEnv = async () => {
    if (!deleteEnvTarget) return;
    setIsDeletingEnv(true);
    try {
      const prefix = `${deleteEnvTarget}.`;
      const envKeys = entries.filter((e) => e.key.startsWith(prefix));
      await Promise.all(
        envKeys.map((e) =>
          secureStorageService.delete(e.key as SecureStorageAccount),
        ),
      );
      const updated = environments.filter((e) => e !== deleteEnvTarget);
      await secureStorageService.saveEnvironments(updated);
      setEnvironments(updated);
      setEntries((prev) => prev.filter((e) => !e.key.startsWith(prefix)));
      if (activeEnv === deleteEnvTarget) setActiveEnv('default');
      toast.success(`Environment "${deleteEnvTarget}" deleted`);
      setDeleteEnvTarget(null);
    } catch {
      toast.error('Failed to delete environment');
      await load();
    } finally {
      setIsDeletingEnv(false);
    }
  };

  const closeAddEnvDialog = () => {
    setAddEnvOpen(false);
    setNewEnvName('');
    setAddEnvError('');
  };

  const deleteEnvKeyCount = deleteEnvTarget
    ? entries.filter((e) => e.key.startsWith(`${deleteEnvTarget}.`)).length
    : 0;

  return (
    <Box maxWidth={800} width="100%" mt={3}>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Credentials stored in the system keystore, encrypted at rest by the OS.
        Use environments to group related keys — keys are prefixed with the
        environment name (e.g.{' '}
        <code style={{ fontFamily: 'monospace' }}>dev.MY_KEY</code>).
      </Typography>

      <Box
        display="flex"
        alignItems="center"
        mb={2}
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        <Tabs
          value={activeEnv}
          onChange={(_e, v) => setActiveEnv(v as string)}
          sx={{ flex: 1, minHeight: 0 }}
        >
          <Tab label="Default" value="default" />
          {environments.map((env) => (
            <Tab
              key={env}
              value={env}
              label={
                <Box display="flex" alignItems="center" gap={0.5}>
                  {env}
                  <Close
                    sx={{
                      fontSize: 14,
                      ml: 0.25,
                      opacity: 0.5,
                      '&:hover': { opacity: 1 },
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteEnvTarget(env);
                    }}
                  />
                </Box>
              }
            />
          ))}
        </Tabs>
        <Tooltip title="Add environment">
          <IconButton
            size="small"
            onClick={() => setAddEnvOpen(true)}
            sx={{ ml: 1 }}
          >
            <Add fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Card
        variant="outlined"
        sx={{ borderRadius: 1, borderColor: 'divider', mb: 3 }}
      >
        <CardContent>
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <VpnKey color="primary" />
            <Typography variant="h6" sx={{ m: 0 }}>
              {activeEnv === 'default' ? 'Default' : activeEnv}
            </Typography>
          </Box>

          {isLoading && (
            <Box display="flex" justifyContent="center" py={2}>
              <CircularProgress size={24} />
            </Box>
          )}
          {!isLoading && envEntries.length === 0 && (
            <Alert severity="info">No entries in this environment yet.</Alert>
          )}
          {!isLoading &&
            envEntries.length > 0 &&
            envEntries.map((entry, i) => (
              <React.Fragment key={entry.key}>
                {i > 0 && <Divider />}
                <Box display="flex" alignItems="center" gap={1} py={1}>
                  <Box flex={1} minWidth={0}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                    >
                      Key
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}
                    >
                      {displayKey(entry.key)}
                    </Typography>
                  </Box>
                  <Box flex={1} minWidth={0}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                    >
                      Value
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}
                    >
                      {entry.visibleValue !== null
                        ? entry.visibleValue
                        : '••••••••'}
                    </Typography>
                  </Box>
                  <Box
                    display="flex"
                    alignItems="center"
                    gap={0.5}
                    flexShrink={0}
                  >
                    {entry.loading ? (
                      <CircularProgress size={16} />
                    ) : (
                      <Tooltip
                        title={entry.visibleValue !== null ? 'Hide' : 'Reveal'}
                      >
                        <IconButton
                          size="small"
                          onClick={() => handleToggleReveal(entry.key)}
                        >
                          {entry.visibleValue !== null ? (
                            <VisibilityOff fontSize="small" />
                          ) : (
                            <Visibility fontSize="small" />
                          )}
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => setDeleteKeyTarget(entry.key)}
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              </React.Fragment>
            ))}
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ borderRadius: 1, borderColor: 'divider' }}>
        <CardContent>
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <Add color="primary" />
            <Typography variant="h6" sx={{ m: 0 }}>
              Add Entry
            </Typography>
          </Box>
          <Box display="flex" gap={2} alignItems="flex-start">
            <TextField
              label="Key"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              size="small"
              fullWidth
              inputProps={{ style: { fontFamily: 'monospace' } }}
              slotProps={
                activeEnv !== 'default'
                  ? {
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <Typography
                              variant="body2"
                              sx={{
                                fontFamily: 'monospace',
                                color: 'text.disabled',
                                userSelect: 'none',
                              }}
                            >
                              {activeEnv}.
                            </Typography>
                          </InputAdornment>
                        ),
                      },
                    }
                  : undefined
              }
            />
            <TextField
              label="Value"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              size="small"
              fullWidth
              type={showNewValue ? 'text' : 'password'}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => setShowNewValue((v) => !v)}
                      >
                        {showNewValue ? (
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
            <Button
              variant="contained"
              size="small"
              startIcon={
                isSaving ? (
                  <CircularProgress size={14} color="inherit" />
                ) : (
                  <Add />
                )
              }
              onClick={handleAdd}
              disabled={!newKey.trim() || !newValue.trim() || isSaving}
              sx={{ whiteSpace: 'nowrap', mt: 0.25 }}
            >
              Add
            </Button>
          </Box>
        </CardContent>
      </Card>

      <Dialog
        open={!!deleteKeyTarget}
        onClose={() => setDeleteKeyTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete Key</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Permanently delete{' '}
            <strong style={{ fontFamily: 'monospace' }}>
              {deleteKeyTarget ? displayKey(deleteKeyTarget) : ''}
            </strong>
            ? This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteKeyTarget(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDeleteKey}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={addEnvOpen}
        onClose={closeAddEnvDialog}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>New Environment</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label="Environment name"
            value={newEnvName}
            onChange={(e) => {
              setNewEnvName(e.target.value);
              setAddEnvError('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleAddEnv()}
            error={!!addEnvError}
            helperText={
              addEnvError ||
              'Keys will be stored as "<name>.<key>" in the OS keystore'
            }
            fullWidth
            size="small"
            sx={{ mt: 1 }}
            inputProps={{ style: { fontFamily: 'monospace' } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeAddEnvDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleAddEnv}
            disabled={!newEnvName.trim()}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!deleteEnvTarget}
        onClose={() => !isDeletingEnv && setDeleteEnvTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete Environment</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Delete environment <strong>{deleteEnvTarget}</strong>? This will
            permanently remove{' '}
            {deleteEnvKeyCount === 0
              ? 'it (no keys stored)'
              : `all ${deleteEnvKeyCount} key(s) stored in it`}
            .
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDeleteEnvTarget(null)}
            disabled={isDeletingEnv}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDeleteEnv}
            disabled={isDeletingEnv}
            startIcon={
              isDeletingEnv ? (
                <CircularProgress size={14} color="inherit" />
              ) : undefined
            }
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
