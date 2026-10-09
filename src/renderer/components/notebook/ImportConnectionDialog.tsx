/**
 * Import Connection Dialog
 * Shown when an imported notebook export JSON includes embedded
 * connection details, letting the user choose whether to create that
 * connection (and import the notebook(s) onto it) or use the currently
 * active connection instead.
 */
import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  FormControlLabel,
  Checkbox,
  TextField,
  Typography,
} from '@mui/material';
import { validateServiceAccountKeyJson } from '../../../shared/spanner';

interface ImportConnectionDialogProps {
  open: boolean;
  connectionName?: string;
  connectionType?: string;
  notebookCount: number;
  /** Whether there's a currently active connection the user can import onto instead */
  hasActiveConnection: boolean;
  /** Ask for a service-account key, which exports never include (Spanner). */
  serviceAccountKeyRequired?: boolean;
  onClose: () => void;
  onConfirm: (importConnection: boolean, serviceAccountKey?: string) => void;
}

export const ImportConnectionDialog: React.FC<ImportConnectionDialogProps> = ({
  open,
  connectionName,
  connectionType,
  notebookCount,
  hasActiveConnection,
  serviceAccountKeyRequired = false,
  onClose,
  onConfirm,
}) => {
  const [importConnection, setImportConnection] = useState(true);
  const [keyJson, setKeyJson] = useState('');
  const needsKey = serviceAccountKeyRequired && importConnection;
  const keyError = needsKey
    ? validateServiceAccountKeyJson(keyJson)
    : undefined;

  useEffect(() => {
    if (open) setKeyJson('');
  }, [open]);

  // Force-enable when there's no fallback connection to import onto
  useEffect(() => {
    if (!hasActiveConnection) {
      setImportConnection(true);
    }
  }, [hasActiveConnection, open]);

  const handleConfirm = () => {
    onConfirm(importConnection, needsKey ? keyJson : undefined);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Import Connection</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 1 }}>
          This file includes connection details for &quot;{connectionName}
          &quot;{connectionType ? ` (${connectionType})` : ''}, in addition to{' '}
          {notebookCount} notebook{notebookCount > 1 ? 's' : ''}.
        </DialogContentText>
        <FormControlLabel
          control={
            <Checkbox
              checked={importConnection}
              disabled={!hasActiveConnection}
              onChange={(e) => setImportConnection(e.target.checked)}
            />
          }
          label="Also import this connection, and open the notebook(s) on it"
        />
        {!hasActiveConnection && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            No connection is currently selected, so the connection from this
            file must be imported to continue.
          </Typography>
        )}
        {needsKey && (
          <TextField
            label="Service account JSON"
            multiline
            minRows={4}
            fullWidth
            required
            sx={{ mt: 2 }}
            value={keyJson}
            onChange={(event) => setKeyJson(event.target.value)}
            error={keyJson.length > 0 && !!keyError}
            helperText={
              keyJson.length > 0 && keyError
                ? keyError
                : 'Exports never include the key. Paste it to import this connection; it is stored in the OS keychain.'
            }
          />
        )}
        {hasActiveConnection && !importConnection && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            The notebook(s) will be imported onto the currently selected
            connection instead.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          disabled={needsKey && !!keyError}
        >
          Import
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ImportConnectionDialog;
