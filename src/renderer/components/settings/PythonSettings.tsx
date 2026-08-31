import React, { useEffect, useState } from 'react';
import {
  Button,
  Box,
  Chip,
  Typography,
  Alert,
  CircularProgress,
  Backdrop,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
} from '@mui/material';
import {
  CheckCircle,
  Delete,
  Download,
  Refresh,
  Warning,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { SettingsType, PythonVersionInfo } from '../../../types/backend';
import { ConfirmationModal } from '../modals';
import {
  useCheckPythonVersions,
  useInstallPythonVersion,
  useUninstallPython,
} from '../../controllers';

interface PythonSettingsProps {
  settings: SettingsType;
}

export const PythonSettings: React.FC<PythonSettingsProps> = ({ settings }) => {
  const [versionInfo, setVersionInfo] = useState<PythonVersionInfo | null>(
    null,
  );
  const [pendingVersion, setPendingVersion] = useState<string | null>(null);
  const [installingVersion, setInstallingVersion] = useState<string | null>(
    null,
  );
  const [showUninstallConfirmation, setShowUninstallConfirmation] =
    useState(false);
  const [isBlocking, setIsBlocking] = useState(false);

  const checkVersions = useCheckPythonVersions({
    onSuccess: (data) => setVersionInfo(data),
    onError: (error) => {
      toast.error(`Failed to check Python versions: ${error.message}`);
    },
  });

  const installVersion = useInstallPythonVersion({
    onSuccess: (result) => {
      setInstallingVersion(null);
      setIsBlocking(false);
      if (result.success) {
        toast.success(`Python ${result.version} installed successfully`);
        checkVersions.mutate();
      } else {
        toast.error(`Installation failed: ${result.error}`);
      }
    },
    onError: (error) => {
      setInstallingVersion(null);
      setIsBlocking(false);
      toast.error(`Installation failed: ${error.message}`);
    },
  });

  const uninstallPython = useUninstallPython({
    onSuccess: () => {
      setIsBlocking(false);
      toast.success('Python uninstalled successfully');
      setVersionInfo(null);
      checkVersions.mutate();
    },
    onError: (error) => {
      setIsBlocking(false);
      toast.error(`Uninstall failed: ${error.message}`);
    },
  });

  useEffect(() => {
    checkVersions.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isInstalled = Boolean(settings.pythonPath);

  const requestInstallVersion = (version: string) => {
    if (isInstalled && version !== settings.pythonVersion) {
      setPendingVersion(version);
      return;
    }
    setInstallingVersion(version);
    setIsBlocking(true);
    installVersion.mutate(version);
  };

  const confirmVersionSwitch = () => {
    if (!pendingVersion) return;
    const version = pendingVersion;
    setPendingVersion(null);
    setInstallingVersion(version);
    setIsBlocking(true);
    installVersion.mutate(version);
  };

  const cancelVersionSwitch = () => {
    setPendingVersion(null);
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

  const getButtonLabel = (version: string) => {
    if (version === settings.pythonVersion) return 'Installed';
    if (installingVersion === version) return 'Installing...';
    const currentVersion = settings.pythonVersion;
    if (!currentVersion) return 'Install';
    const entry = versionInfo?.availableVersions.find(
      (v) => v.version === version,
    );
    if (entry?.isNewer) return 'Upgrade';
    if (entry?.isOlder) return 'Downgrade';
    return 'Install';
  };

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
            install the recommended version below.
          </Typography>
        </Alert>
      )}

      <Box sx={{ mb: 2 }}>
        <Button
          variant="outlined"
          onClick={() => checkVersions.mutate()}
          disabled={checkVersions.isLoading}
          startIcon={
            checkVersions.isLoading ? (
              <CircularProgress size={16} />
            ) : (
              <Refresh />
            )
          }
        >
          {checkVersions.isLoading ? 'Refreshing...' : 'Refresh Versions'}
        </Button>
      </Box>

      {versionInfo && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Available Versions
          </Typography>
          <List
            sx={{
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
            }}
          >
            {versionInfo.availableVersions.map((entry, index) => (
              <React.Fragment key={entry.version}>
                <ListItem>
                  <ListItemText
                    primary={
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                      >
                        <Typography variant="body1" sx={{ fontWeight: 500 }}>
                          {entry.version}
                        </Typography>
                        {entry.isRecommended && (
                          <Chip
                            label="Recommended"
                            size="small"
                            color="primary"
                          />
                        )}
                        {entry.version === settings.pythonVersion && (
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.5,
                            }}
                          >
                            <CheckCircle color="success" fontSize="small" />
                            <Chip
                              label="Installed"
                              size="small"
                              color="success"
                            />
                          </Box>
                        )}
                      </Box>
                    }
                  />
                  <ListItemSecondaryAction>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => requestInstallVersion(entry.version)}
                      disabled={
                        entry.version === settings.pythonVersion ||
                        installingVersion === entry.version ||
                        installVersion.isLoading
                      }
                      startIcon={
                        installingVersion === entry.version ? (
                          <CircularProgress size={16} />
                        ) : (
                          <Download />
                        )
                      }
                    >
                      {getButtonLabel(entry.version)}
                    </Button>
                  </ListItemSecondaryAction>
                </ListItem>
                {index < versionInfo.availableVersions.length - 1 && (
                  <Divider />
                )}
              </React.Fragment>
            ))}
          </List>
        </Box>
      )}

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
        isOpen={Boolean(pendingVersion)}
        onClose={cancelVersionSwitch}
        onConfirm={confirmVersionSwitch}
        title="Switch Python Version"
        question={`Are you sure you want to switch to Python ${pendingVersion}? This replaces the managed environment and removes dbt Core, Flowfile, and sqlglot, since they all live inside it. You'll need to reinstall them afterward.`}
      />

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
