import React from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Alert,
  Stack,
  Paper,
  Divider,
  IconButton,
  InputAdornment,
  Autocomplete,
  CircularProgress,
} from '@mui/material';
import {
  PlayArrow,
  Delete,
  Visibility,
  VisibilityOff,
  VpnKey,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { Modal } from '../modal';
import { useExtractRequiredEnvVars } from '../../../controllers';
import { useRunner } from '../../../hooks';
import { Project } from '../../../../types/backend';
import { secureStorageService } from '../../../services/secureStorage.service';
import { SecureStorageAccount } from '../../../../types/frontend';

const PLACEHOLDER_SENTINEL = '__PLACEHOLDER__';

interface EnvRow {
  id: string;
  key: string;
  value: string;
  isRequired: boolean;
}

interface RunWithEnvModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  project: Project;
  pipelineRelativePath: string;
  connectionName?: string;
  connType?: string;
}

export const RunWithEnvModal: React.FC<RunWithEnvModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  project,
  pipelineRelativePath,
  connectionName,
  connType,
}) => {
  const { run: runPipelineLocally } = useRunner();
  const { data: requiredVars = [], isLoading: requiredLoading } =
    useExtractRequiredEnvVars(project.id, pipelineRelativePath);

  const [rows, setRows] = React.useState<EnvRow[]>([]);
  const [visibleIds, setVisibleIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [newKey, setNewKey] = React.useState('');
  const [newValue, setNewValue] = React.useState('');
  const [showNewValue, setShowNewValue] = React.useState(false);
  const [isRunning, setIsRunning] = React.useState(false);
  const [prefilling, setPrefilling] = React.useState(false);
  const [error, setError] = React.useState('');
  const [keystoreKeys, setKeystoreKeys] = React.useState<string[]>([]);
  const [keystoreLoading, setKeystoreLoading] = React.useState(false);

  // Re-run the prefill once per open, not on every requiredVars refetch -
  // otherwise values the user is actively editing would get clobbered.
  const initializedRef = React.useRef(false);

  React.useEffect(() => {
    if (!isOpen) {
      initializedRef.current = false;
      setPrefilling(false);
      return;
    }
    if (initializedRef.current || requiredLoading) return;
    initializedRef.current = true;
    setPrefilling(true);

    let cancelled = false;
    (async () => {
      const prefilled = await Promise.all(
        requiredVars.map(async (v) => {
          // A TF_VAR_-prefixed terraform variable that mirrors a Studio
          // connection value (e.g. TF_VAR_db-project-demo-bigquery) should
          // resolve to that same already-known keystore entry rather than
          // asking the user to re-enter it - the AI is guided to name such
          // variables exactly after the connection's own env var name, so
          // stripping the prefix is a deterministic (not heuristic) lookup.
          const strippedName = v.name.startsWith('TF_VAR_')
            ? v.name.slice('TF_VAR_'.length)
            : null;
          const [devMatch, bareMatch, strippedMatch] = await Promise.all([
            secureStorageService
              .get(`dev.${v.name}` as SecureStorageAccount)
              .catch(() => null),
            secureStorageService
              .get(v.name as SecureStorageAccount)
              .catch(() => null),
            strippedName
              ? secureStorageService
                  .get(strippedName as SecureStorageAccount)
                  .catch(() => null)
              : Promise.resolve(null),
          ]);
          const isReal = (stored: string | null) =>
            stored !== null && stored !== PLACEHOLDER_SENTINEL && stored !== '';
          let value = '';
          if (isReal(devMatch)) {
            value = devMatch as string;
          } else if (isReal(bareMatch)) {
            value = bareMatch as string;
          } else if (isReal(strippedMatch)) {
            value = strippedMatch as string;
          }
          return { id: v.name, key: v.name, value, isRequired: true };
        }),
      );
      if (!cancelled) {
        setRows(prefilled);
        setPrefilling(false);
      }
    })();

    // eslint-disable-next-line consistent-return
    return () => {
      cancelled = true;
    };
  }, [isOpen, requiredLoading, requiredVars]);

  const loadKeystoreKeys = React.useCallback(async () => {
    setKeystoreLoading(true);
    try {
      setKeystoreKeys(await secureStorageService.list());
    } catch {
      setKeystoreKeys([]);
    } finally {
      setKeystoreLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (isOpen) loadKeystoreKeys();
  }, [isOpen, loadKeystoreKeys]);

  const addCustomRow = () => {
    const trimmedKey = newKey.trim();
    const trimmedValue = newValue.trim();
    if (!trimmedKey || !trimmedValue) {
      setError('Both key and value are required.');
      return;
    }
    if (rows.some((row) => row.key === trimmedKey)) {
      setError('That variable is already listed.');
      return;
    }
    setRows((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}`,
        key: trimmedKey,
        value: trimmedValue,
        isRequired: false,
      },
    ]);
    setError('');
    setNewKey('');
    setNewValue('');
    setShowNewValue(false);
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((row) => row.id !== id));
  };

  const updateRowValue = (id: string, value: string) => {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, value } : row)),
    );
  };

  const toggleVisibility = (id: string) => {
    setVisibleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleAddFromKeystore = async (keystoreKey: string) => {
    try {
      const value = await secureStorageService.get(
        keystoreKey as SecureStorageAccount,
      );
      if (value === null) return;
      const varKey = keystoreKey.includes('.')
        ? keystoreKey.slice(keystoreKey.indexOf('.') + 1)
        : keystoreKey;
      const displayValue = value === PLACEHOLDER_SENTINEL ? '' : value;
      setRows((prev) => {
        const existing = prev.find((row) => row.key === varKey);
        if (existing) {
          return prev.map((row) =>
            row.key === varKey ? { ...row, value: displayValue } : row,
          );
        }
        return [
          ...prev,
          {
            id: `keystore-${Date.now()}`,
            key: varKey,
            value: displayValue,
            isRequired: false,
          },
        ];
      });
    } catch {
      setError(`Failed to retrieve value for "${keystoreKey}".`);
    }
  };

  const handleRun = async () => {
    setError('');

    const missingRequired = rows.filter(
      (row) => row.isRequired && !row.value.trim(),
    );
    if (missingRequired.length > 0) {
      setError(
        `Missing required value${missingRequired.length > 1 ? 's' : ''} for: ${missingRequired
          .map((row) => row.key)
          .join(', ')}`,
      );
      return;
    }

    const extraEnv = rows.reduce<Record<string, string>>((acc, row) => {
      if (row.value.trim()) acc[row.key] = row.value.trim();
      return acc;
    }, {});

    setIsRunning(true);
    try {
      // Remember entered values (required and custom alike) so the next
      // run of this pipeline doesn't ask again. Best-effort - a keystore
      // write failure shouldn't block the run itself.
      await Promise.all(
        Object.entries(extraEnv).map(([key, value]) =>
          secureStorageService
            .set(key as SecureStorageAccount, value)
            .catch(() => {}),
        ),
      );

      const result = await runPipelineLocally({
        workspaceDir: project.path,
        pipelineFile: pipelineRelativePath,
        connectionName,
        connType,
        extraEnv,
      });
      if (result.success) {
        toast.success('Pipeline run started. Track progress in Task Manager.');
        onSuccess?.();
        onClose();
      } else {
        setError(result.error || 'Failed to start the pipeline run');
      }
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Run with env">
      <Stack spacing={2.5}>
        <Typography variant="body2" color="text.secondary">
          Set the env vars this pipeline needs (e.g.{' '}
          <code>TF_VAR_project_id</code>) before running it locally. Values here
          are only used for this run - add them in Settings → Keystore to reuse
          them next time.
        </Typography>

        {error && (
          <Alert severity="error" onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {requiredLoading ? (
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <CircularProgress size={20} />
          </Box>
        ) : (
          <Stack spacing={1.5}>
            {rows.length === 0 && (
              <Typography variant="caption" color="text.secondary">
                No env vars detected for this pipeline. Add any custom ones
                below if needed.
              </Typography>
            )}
            {rows.map((row) => (
              <Paper
                key={row.id}
                variant="outlined"
                sx={{ p: 1.5, borderRadius: 1.5 }}
              >
                <Box display="flex" gap={1} alignItems="center">
                  <TextField
                    value={row.key}
                    size="small"
                    slotProps={{ input: { readOnly: true } }}
                    sx={{
                      flex: '0 0 40%',
                      minWidth: 0,
                      '& .MuiInputBase-input': {
                        fontFamily: 'monospace',
                        fontWeight: 600,
                      },
                    }}
                  />
                  <TextField
                    value={row.value}
                    size="small"
                    type={visibleIds.has(row.id) ? 'text' : 'password'}
                    placeholder="Enter value"
                    onChange={(e) => updateRowValue(row.id, e.target.value)}
                    sx={{ flex: 1, minWidth: 0 }}
                    slotProps={{
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              size="small"
                              onClick={() => toggleVisibility(row.id)}
                              aria-label={
                                visibleIds.has(row.id)
                                  ? `Hide ${row.key} value`
                                  : `Show ${row.key} value`
                              }
                            >
                              {visibleIds.has(row.id) ? (
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
                  {!row.isRequired && (
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => removeRow(row.id)}
                      aria-label={`Remove ${row.key}`}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  )}
                </Box>
              </Paper>
            ))}
          </Stack>
        )}

        <Divider />

        <Stack spacing={1}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            Add custom variable
          </Typography>
          <Box display="flex" gap={1}>
            <TextField
              label="Key"
              size="small"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              sx={{ flex: 1 }}
            />
            <TextField
              label="Value"
              size="small"
              type={showNewValue ? 'text' : 'password'}
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              sx={{ flex: 1 }}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => setShowNewValue((prev) => !prev)}
                        aria-label={showNewValue ? 'Hide value' : 'Show value'}
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
            <Button onClick={addCustomRow} variant="outlined" size="small">
              Add
            </Button>
          </Box>
          <Autocomplete
            options={keystoreKeys}
            loading={keystoreLoading}
            value={null}
            onChange={(_event, key) => key && handleAddFromKeystore(key)}
            renderInput={(params) => (
              <TextField
                // eslint-disable-next-line react/jsx-props-no-spreading
                {...params}
                size="small"
                label="Add from keystore"
                placeholder="Search keystore…"
                slotProps={{
                  input: {
                    ...params.InputProps,
                    startAdornment: (
                      <VpnKey
                        fontSize="small"
                        sx={{ mr: 0.5, color: 'text.secondary' }}
                      />
                    ),
                  },
                }}
              />
            )}
          />
        </Stack>

        <Box display="flex" justifyContent="flex-end" gap={1.5} pt={1}>
          <Button onClick={onClose} disabled={isRunning}>
            Cancel
          </Button>
          <Button
            variant="contained"
            startIcon={
              isRunning ? <CircularProgress size={16} /> : <PlayArrow />
            }
            onClick={handleRun}
            disabled={isRunning || prefilling}
          >
            {isRunning ? 'Starting…' : 'Run'}
          </Button>
        </Box>
      </Stack>
    </Modal>
  );
};
