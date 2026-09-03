import React, { useState } from 'react';
import {
  Box,
  Button,
  Typography,
  Alert,
  Divider,
  ToggleButtonGroup,
  ToggleButton,
  CircularProgress,
  Paper,
} from '@mui/material';
import {
  FileDownload,
  FileUpload,
  MergeType,
  RestartAlt,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useExportBackup, useImportBackup } from '../../controllers';
import { ConfirmationModal } from '../modals';

export const BackupSettings: React.FC = () => {
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false);

  const { mutate: exportBackup, isLoading: exporting } = useExportBackup({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Backup exported to ${result.filePath}`);
      } else if (!result.canceled) {
        toast.error(`Export failed: ${result.error ?? 'Unknown error'}`);
      }
    },
    onError: () => {
      toast.error('Export failed.');
    },
  });

  const { mutate: importBackup, isLoading: importing } = useImportBackup({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(
          `Import complete — ${result.imported} added, ${result.skipped} skipped (already exist).`,
        );
      } else if (!result.canceled) {
        toast.error(`Import failed: ${result.error ?? 'Unknown error'}`);
      }
    },
    onError: () => {
      toast.error('Import failed.');
    },
  });

  const handleImport = () => {
    if (importMode === 'replace') {
      setConfirmReplaceOpen(true);
    } else {
      importBackup('merge');
    }
  };

  const handleConfirmedReplace = () => {
    setConfirmReplaceOpen(false);
    importBackup('replace');
  };

  return (
    <Box sx={{ maxWidth: 640 }}>
      {/* Export */}
      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <FileDownload color="primary" />
          <Typography variant="subtitle1" fontWeight={600}>
            Export backup
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Saves all connections (including credentials) and your current
          settings to a single <code>.json</code> file. You can share this file
          with a teammate or use it to restore your setup on another machine.
        </Typography>
        <Alert severity="warning" sx={{ mb: 2 }}>
          The export file contains database credentials in plain text. Keep it
          secure and do not commit it to version control.
        </Alert>
        <Button
          variant="contained"
          startIcon={
            exporting ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <FileDownload />
            )
          }
          onClick={() => exportBackup()}
          disabled={exporting || importing}
        >
          {exporting ? 'Exporting…' : 'Export connections & settings'}
        </Button>
      </Paper>

      <Divider sx={{ mb: 3 }} />

      {/* Import */}
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <FileUpload color="primary" />
          <Typography variant="subtitle1" fontWeight={600}>
            Import backup
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Restore connections from a previously exported backup file. Choose how
          to handle conflicts with your existing connections.
        </Typography>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mb: 0.5, display: 'block' }}
        >
          Import mode
        </Typography>
        <ToggleButtonGroup
          value={importMode}
          exclusive
          size="small"
          onChange={(_e, val) => val && setImportMode(val)}
          sx={{ mb: 2 }}
        >
          <ToggleButton value="merge" aria-label="Merge">
            <MergeType fontSize="small" sx={{ mr: 0.5 }} />
            Merge
          </ToggleButton>
          <ToggleButton value="replace" aria-label="Replace all">
            <RestartAlt fontSize="small" sx={{ mr: 0.5 }} />
            Replace all
          </ToggleButton>
        </ToggleButtonGroup>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {importMode === 'merge'
            ? 'New connections from the backup are added. Connections with a name that already exists are skipped.'
            : 'All existing connections are removed and replaced with the ones from the backup. Settings are also restored.'}
        </Typography>

        {importMode === 'replace' && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Replace mode will permanently delete all your current connections
            before importing. This cannot be undone.
          </Alert>
        )}

        <Button
          variant="contained"
          color={importMode === 'replace' ? 'error' : 'primary'}
          startIcon={
            importing ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <FileUpload />
            )
          }
          onClick={handleImport}
          disabled={exporting || importing}
        >
          {importing ? 'Importing…' : 'Import from backup file'}
        </Button>
      </Paper>

      {/* Replace confirmation dialog */}
      <ConfirmationModal
        isOpen={confirmReplaceOpen}
        title="Replace all connections?"
        question="This will permanently delete all existing connections and settings, then import from your backup file. This cannot be undone."
        onConfirm={handleConfirmedReplace}
        onClose={() => setConfirmReplaceOpen(false)}
      />
    </Box>
  );
};
