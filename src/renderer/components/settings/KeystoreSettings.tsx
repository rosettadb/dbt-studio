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
} from '@mui/material';
import {
  Delete,
  Visibility,
  VisibilityOff,
  Add,
  VpnKey,
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
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [newKey, setNewKey] = React.useState('');
  const [newValue, setNewValue] = React.useState('');
  const [showNewValue, setShowNewValue] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const keys = await secureStorageService.list();
      setEntries(
        keys.sort().map((key) => ({ key, visibleValue: null, loading: false })),
      );
    } catch {
      toast.error('Failed to load keystore entries');
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleToggleReveal = async (index: number) => {
    const entry = entries[index];
    if (entry.visibleValue !== null) {
      setEntries((prev) =>
        prev.map((e, i) => (i === index ? { ...e, visibleValue: null } : e)),
      );
      return;
    }
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, loading: true } : e)),
    );
    try {
      const value = await secureStorageService.get(
        entry.key as SecureStorageAccount,
      );
      setEntries((prev) =>
        prev.map((e, i) =>
          i === index ? { ...e, visibleValue: value ?? '', loading: false } : e,
        ),
      );
    } catch {
      setEntries((prev) =>
        prev.map((e, i) => (i === index ? { ...e, loading: false } : e)),
      );
      toast.error('Failed to reveal value');
    }
  };

  const handleDelete = async (index: number) => {
    const entry = entries[index];
    try {
      await secureStorageService.delete(entry.key as SecureStorageAccount);
      setEntries((prev) => prev.filter((_, i) => i !== index));
      toast.success(`Deleted "${entry.key}"`);
    } catch {
      toast.error(`Failed to delete "${entry.key}"`);
    }
  };

  const handleAdd = async () => {
    if (!newKey.trim() || !newValue.trim()) return;
    setIsSaving(true);
    try {
      await secureStorageService.set(
        newKey.trim() as SecureStorageAccount,
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

  return (
    <Box maxWidth={800} width="100%" mt={3}>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Credentials stored in the system keystore. Values are encrypted at rest
        by the OS.
      </Typography>

      <Card
        variant="outlined"
        sx={{ borderRadius: 1, borderColor: 'divider', mb: 3 }}
      >
        <CardContent>
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <VpnKey color="primary" />
            <Typography variant="h6" sx={{ m: 0 }}>
              Stored Entries
            </Typography>
          </Box>

          {isLoading && (
            <Box display="flex" justifyContent="center" py={2}>
              <CircularProgress size={24} />
            </Box>
          )}
          {!isLoading && entries.length === 0 && (
            <Alert severity="info">No entries stored yet.</Alert>
          )}
          {!isLoading &&
            entries.length > 0 &&
            entries.map((entry, i) => (
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
                      {entry.key}
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
                          onClick={() => handleToggleReveal(i)}
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
                        onClick={() => handleDelete(i)}
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
              size="small"
              fullWidth
              inputProps={{ style: { fontFamily: 'monospace' } }}
            />
            <TextField
              label="Value"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
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
    </Box>
  );
};
