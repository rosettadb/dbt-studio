/**
 * Packages Dialog
 * pip list / install / uninstall for a notebook's own virtualenv.
 */

import React, { useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemText,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Delete as DeleteIcon } from '@mui/icons-material';
import {
  useInstallNotebookPackages,
  useNotebookEnvEvents,
  useNotebookPackages,
  useUninstallNotebookPackage,
} from '../../../controllers/pythonNotebooks.controller';

interface PackagesDialogProps {
  open: boolean;
  notebookId: string;
  envReady: boolean;
  onClose: () => void;
}

export const PackagesDialog: React.FC<PackagesDialogProps> = ({
  open,
  notebookId,
  envReady,
  onClose,
}) => {
  const {
    data: packages = [],
    isLoading,
    error,
  } = useNotebookPackages(notebookId, open && envReady);
  const install = useInstallNotebookPackages();
  const uninstall = useUninstallNotebookPackage();
  const [specInput, setSpecInput] = useState('');
  const [progressLine, setProgressLine] = useState('');

  useNotebookEnvEvents(notebookId, (event) => {
    if (event.message) setProgressLine(event.message);
  });

  const busy = install.isLoading || uninstall.isLoading;

  const handleInstall = () => {
    const specs = specInput
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (specs.length === 0) return;
    setProgressLine('');
    install.mutate(
      { notebookId, specs },
      { onSuccess: () => setSpecInput('') },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Packages</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 1 }}>
          <TextField
            size="small"
            fullWidth
            label="pip install"
            placeholder="pandas matplotlib==3.9.0 requests"
            value={specInput}
            onChange={(e) => setSpecInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleInstall();
              }
            }}
            disabled={!envReady || busy}
            helperText="Installed into this notebook's own environment only"
          />
          <Button
            variant="contained"
            onClick={handleInstall}
            disabled={!envReady || busy || !specInput.trim()}
            sx={{ mt: 0.25, whiteSpace: 'nowrap' }}
          >
            {install.isLoading ? 'Installing…' : 'Install'}
          </Button>
        </Box>

        {busy && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <CircularProgress size={14} />
            <Typography
              variant="caption"
              color="text.secondary"
              noWrap
              sx={{ flex: 1 }}
            >
              {progressLine || 'Working…'}
            </Typography>
          </Box>
        )}

        {!envReady && (
          <Typography variant="body2" color="text.secondary">
            The environment is not ready yet.
          </Typography>
        )}
        {error ? (
          <Typography variant="body2" color="error">
            {(error as Error).message}
          </Typography>
        ) : null}
        {isLoading && envReady && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
            <CircularProgress size={20} />
          </Box>
        )}

        <List dense sx={{ maxHeight: 360, overflowY: 'auto' }}>
          {packages.map((pkg) => (
            <ListItem
              key={pkg.name}
              secondaryAction={
                <Tooltip title="Uninstall">
                  <span>
                    <IconButton
                      edge="end"
                      size="small"
                      disabled={busy}
                      onClick={() =>
                        uninstall.mutate({ notebookId, name: pkg.name })
                      }
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              }
            >
              <ListItemText
                primary={pkg.name}
                secondary={pkg.version}
                primaryTypographyProps={{ fontSize: 13 }}
                secondaryTypographyProps={{ fontSize: 11 }}
              />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PackagesDialog;
