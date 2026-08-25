import React, { useState } from 'react';
import {
  Button,
  Box,
  Typography,
  Alert,
  CircularProgress,
  Backdrop,
} from '@mui/material';
import { CheckCircle, Delete, Download, Warning } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { SettingsType } from '../../../types/backend';
import { ConfirmationModal } from '../modals';
import { useInstallPython, useUninstallPython } from '../../controllers';

interface PythonSettingsProps {
  settings: SettingsType;
}

export const PythonSettings: React.FC<PythonSettingsProps> = ({ settings }) => {
  const [showUninstallConfirmation, setShowUninstallConfirmation] =
    useState(false);
  const [isBlocking, setIsBlocking] = useState(false);

  const installPython = useInstallPython({
    onSuccess: (result) => {
      setIsBlocking(false);
      if (result.success) {
        toast.success(`Python ${result.version} installed successfully`);
      } else {
        toast.error(`Installation failed: ${result.error}`);
      }
    },
    onError: (error) => {
      setIsBlocking(false);
      toast.error(`Installation failed: ${error.message}`);
    },
  });

  const uninstallPython = useUninstallPython({
    onSuccess: () => {
      setIsBlocking(false);
      toast.success('Python uninstalled successfully');
    },
    onError: (error) => {
      setIsBlocking(false);
      toast.error(`Uninstall failed: ${error.message}`);
    },
  });

  const handleInstall = () => {
    setIsBlocking(true);
    installPython.mutate();
  };

  const handleUninstall = () => {
    setShowUninstallConfirmation(true);
  };

  const confirmUninstall = () => {
    setShowUninstallConfirmation(false);
    setIsBlocking(true);
    uninstallPython.mutate();
  };

  const cancelUninstall = () => {
    setShowUninstallConfirmation(false);
  };

  const isInstalled = Boolean(settings.pythonPath);
  let installButtonLabel = isInstalled ? 'Reinstall Python' : 'Install Python';
  if (installPython.isLoading) installButtonLabel = 'Installing...';

  return (
    <Box sx={{ maxWidth: 800 }}>
      <Backdrop
        open={isBlocking}
        sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, color: '#fff' }}
      >
        <CircularProgress color="inherit" />
      </Backdrop>

      <Typography variant="h6" gutterBottom>
        Python Installation
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Rosetta DBT Studio manages its own embedded Python interpreter,
        independent of any Python installed on your system. It is required to
        run dbt Core (v1 and v2), Flowfile, and sqlglot (used for column
        lineage).
      </Typography>

      {isInstalled ? (
        <Alert severity="success" sx={{ mb: 3 }} icon={<CheckCircle />}>
          <Typography variant="body1" sx={{ fontWeight: 500 }}>
            Python is installed at: {settings.pythonPath}
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            Version: {settings.pythonVersion || 'Unknown'}
          </Typography>
        </Alert>
      ) : (
        <Alert severity="warning" sx={{ mb: 3 }} icon={<Warning />}>
          <Typography variant="body1">
            Python is not installed. It will be installed automatically when
            needed (for example, when installing dbt Core v1), or you can
            install it now.
          </Typography>
        </Alert>
      )}

      <Box sx={{ mb: 3 }}>
        <Button
          variant="contained"
          onClick={handleInstall}
          disabled={installPython.isLoading}
          startIcon={
            installPython.isLoading ? (
              <CircularProgress size={16} />
            ) : (
              <Download />
            )
          }
        >
          {installButtonLabel}
        </Button>
      </Box>

      {isInstalled && (
        <Box sx={{ pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="h6" gutterBottom color="error">
            Danger Zone
          </Typography>
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body2">
              Uninstalling Python removes the embedded interpreter along with
              everything installed inside it — dbt Core (v1 and v2), Flowfile,
              and sqlglot. You will need to reinstall them afterward. This
              action cannot be undone.
            </Typography>
          </Alert>
          <Button
            variant="outlined"
            color="error"
            onClick={handleUninstall}
            disabled={uninstallPython.isLoading}
            startIcon={
              uninstallPython.isLoading ? (
                <CircularProgress size={16} />
              ) : (
                <Delete />
              )
            }
          >
            {uninstallPython.isLoading ? 'Uninstalling...' : 'Uninstall Python'}
          </Button>
        </Box>
      )}

      <ConfirmationModal
        isOpen={showUninstallConfirmation}
        onClose={cancelUninstall}
        onConfirm={confirmUninstall}
        title="Uninstall Python"
        question="Are you sure you want to uninstall the embedded Python interpreter? This also removes dbt Core, Flowfile, and sqlglot, since they all live inside the same managed environment. You'll need to reinstall them."
      />
    </Box>
  );
};
