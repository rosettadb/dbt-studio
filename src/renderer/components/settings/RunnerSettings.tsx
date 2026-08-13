import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Box,
  Chip,
  Typography,
  Alert,
  CircularProgress,
  Divider,
  IconButton,
  Tooltip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Backdrop,
} from '@mui/material';
import {
  Refresh,
  Delete,
  Download,
  CheckCircle,
  Info,
  Warning,
  Launch,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { SettingsType, RunnerVersionInfo } from '../../../types/backend';
import { ConfirmationModal } from '../modals';
import {
  useCheckRunnerVersions,
  useInstallRunnerVersion,
  useUninstallRunnerVersion,
  useCheckRunnerPluginDependencies,
  useCheckKisqlVersion,
  useInstallKisql,
  useUninstallKisql,
} from '../../controllers';

interface RunnerSettingsProps {
  settings: SettingsType;
}

export const RunnerSettings: React.FC<RunnerSettingsProps> = ({ settings }) => {
  const navigate = useNavigate();
  const [versionInfo, setVersionInfo] = useState<RunnerVersionInfo | null>(
    null,
  );
  const [installingVersion, setInstallingVersion] = useState<string | null>(
    null,
  );
  const [showUninstallConfirmation, setShowUninstallConfirmation] =
    useState(false);
  const [showKisqlUninstallConfirmation, setShowKisqlUninstallConfirmation] =
    useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const [kisqlUpdateAvailable, setKisqlUpdateAvailable] = useState(false);

  const checkVersions = useCheckRunnerVersions({
    onSuccess: (data) => setVersionInfo(data),
    onError: (error) => {
      toast.error(`Failed to check runner versions: ${error.message}`);
    },
  });

  const pluginDependencies = useCheckRunnerPluginDependencies({
    onError: (error) => {
      toast.error(`Failed to check plugin dependencies: ${error.message}`);
    },
  });

  const installVersion = useInstallRunnerVersion({
    onSuccess: (result) => {
      setInstallingVersion(null);
      setIsBlocking(false);
      if (result.success) {
        toast.success(`Local runner ${result.version} installed`);
        result.warnings?.forEach((warning) => toast.warning(warning));
        checkVersions.mutate();
        pluginDependencies.mutate();
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

  const uninstallRunner = useUninstallRunnerVersion({
    onSuccess: () => {
      setIsBlocking(false);
      toast.success('Local runner uninstalled');
      setVersionInfo(null);
    },
    onError: (error) => {
      setIsBlocking(false);
      toast.error(`Uninstall failed: ${error.message}`);
    },
  });

  // KiSQL hooks
  const checkKisql = useCheckKisqlVersion({
    onSuccess: (data) => {
      setKisqlUpdateAvailable(data.updateAvailable ?? false);
    },
  });

  const installKisql = useInstallKisql({
    onSuccess: (result) => {
      setIsBlocking(false);
      if (result.success) {
        toast.success('KiSQL installed successfully');
        pluginDependencies.mutate();
        checkKisql.mutate();
      } else {
        toast.error(`KiSQL installation failed: ${result.error}`);
      }
    },
    onError: (error) => {
      setIsBlocking(false);
      toast.error(`KiSQL installation failed: ${error.message}`);
    },
  });

  const uninstallKisql = useUninstallKisql({
    onSuccess: () => {
      setIsBlocking(false);
      setKisqlUpdateAvailable(false);
      toast.success('KiSQL uninstalled');
      pluginDependencies.mutate();
    },
    onError: (error) => {
      setIsBlocking(false);
      toast.error(`KiSQL uninstall failed: ${error.message}`);
    },
  });

  useEffect(() => {
    checkVersions.mutate();
    pluginDependencies.mutate();
    checkKisql.mutate();
  }, []);

  const handleInstallVersion = (version: string) => {
    setInstallingVersion(version);
    setIsBlocking(true);
    installVersion.mutate(version);
  };

  const handleInstallKisql = () => {
    setIsBlocking(true);
    installKisql.mutate();
  };

  const confirmUninstall = () => {
    setShowUninstallConfirmation(false);
    setIsBlocking(true);
    uninstallRunner.mutate();
  };

  const confirmKisqlUninstall = () => {
    setShowKisqlUninstallConfirmation(false);
    setIsBlocking(true);
    uninstallKisql.mutate();
  };

  const getButtonText = (version: {
    version: string;
    isNewer: boolean;
    isOlder: boolean;
  }) => {
    if (version.version === versionInfo?.currentVersion) return 'Installed';
    if (installingVersion === version.version) return 'Installing...';
    if (version.isNewer) return 'Upgrade';
    if (version.isOlder) return 'Downgrade';
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
        Local Runner
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        The local runner executes `rosetta/pipelines/*.yml` pipelines on this
        machine, the same way the cloud runner does on the server.
      </Typography>

      {settings.runnerPath ? (
        <Alert severity="success" sx={{ mb: 3 }} icon={<CheckCircle />}>
          <Typography variant="body1" sx={{ fontWeight: 500 }}>
            Runner is installed at: {settings.runnerPath}
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            Version: {settings.runnerVersion || 'Unknown'}
          </Typography>
        </Alert>
      ) : (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography variant="body1">
            The local runner is not installed. Install a version below to enable
            running pipelines locally.
          </Typography>
        </Alert>
      )}

      <Box sx={{ mb: 3 }}>
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
          {checkVersions.isLoading ? 'Loading Versions...' : 'Refresh Versions'}
        </Button>
      </Box>

      {versionInfo && versionInfo.availableVersions.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Available Versions
          </Typography>
          <List sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
            {versionInfo.availableVersions.slice(0, 10).map((version) => (
              <React.Fragment key={version.version}>
                <ListItem>
                  <ListItemText
                    primary={
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                      >
                        <Typography variant="body1" sx={{ fontWeight: 500 }}>
                          {version.version}
                        </Typography>
                        {version.version === versionInfo.currentVersion && (
                          <Chip
                            label="Installed"
                            size="small"
                            color="success"
                          />
                        )}
                        {version.version === versionInfo.latestStable && (
                          <Chip label="Latest" size="small" color="primary" />
                        )}
                      </Box>
                    }
                    secondary={
                      <Typography variant="body2" color="text.secondary">
                        Released:{' '}
                        {new Date(version.releaseDate).toLocaleDateString()}
                      </Typography>
                    }
                  />
                  <ListItemSecondaryAction>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      {version.releaseNotes && (
                        <Tooltip title="View release notes">
                          <IconButton
                            size="small"
                            onClick={() =>
                              window.open(
                                `https://github.com/rosettadb/dbt-studio/releases/tag/v${version.version}`,
                                '_blank',
                              )
                            }
                          >
                            <Info />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => handleInstallVersion(version.version)}
                        disabled={
                          version.version === versionInfo.currentVersion ||
                          installingVersion === version.version ||
                          installVersion.isLoading
                        }
                        startIcon={
                          installingVersion === version.version ? (
                            <CircularProgress size={16} />
                          ) : (
                            <Download />
                          )
                        }
                      >
                        {getButtonText(version)}
                      </Button>
                    </Box>
                  </ListItemSecondaryAction>
                </ListItem>
                <Divider />
              </React.Fragment>
            ))}
          </List>
        </Box>
      )}

      {settings.runnerPath && (
        <Box sx={{ pt: 2, pb: 3, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="h6" gutterBottom color="error">
            Danger Zone
          </Typography>
          <Button
            variant="outlined"
            color="error"
            onClick={() => setShowUninstallConfirmation(true)}
            disabled={uninstallRunner.isLoading}
            startIcon={
              uninstallRunner.isLoading ? (
                <CircularProgress size={16} />
              ) : (
                <Delete />
              )
            }
          >
            {uninstallRunner.isLoading
              ? 'Uninstalling...'
              : 'Uninstall Local Runner'}
          </Button>
        </Box>
      )}

      <Divider sx={{ mb: 3 }} />

      <Typography variant="h6" gutterBottom>
        Plugin Dependencies
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Pipeline steps shell out to these tools - a step fails at run time if
        its tool isn&apos;t available.
      </Typography>

      {pluginDependencies.isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={24} />
        </Box>
      )}

      {pluginDependencies.data && (
        <List sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
          {pluginDependencies.data.map((dep) => (
            <React.Fragment key={dep.id}>
              <ListItem>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body1" sx={{ fontWeight: 500 }}>
                        {dep.label}
                      </Typography>
                      {dep.available ? (
                        <Chip
                          icon={<CheckCircle />}
                          label={dep.version ? `v${dep.version}` : 'Available'}
                          size="small"
                          color="success"
                        />
                      ) : (
                        <Chip
                          icon={<Warning />}
                          label="Not found"
                          size="small"
                          color="warning"
                        />
                      )}
                      {dep.id === 'kinetica_cli' && kisqlUpdateAvailable && (
                        <Chip
                          label="Update available"
                          size="small"
                          color="info"
                        />
                      )}
                    </Box>
                  }
                  secondary={
                    <Typography variant="body2" color="text.secondary">
                      Plugin: {dep.plugin}
                      {dep.path ? ` · ${dep.path}` : ''}
                    </Typography>
                  }
                />
                <ListItemSecondaryAction>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    {(dep.id === 'dbt' || dep.id === 'rosetta') && (
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => navigate(`/app/settings/${dep.id}`)}
                      >
                        Manage
                      </Button>
                    )}
                    {dep.id === 'kinetica_cli' && (
                      <>
                        <Button
                          size="small"
                          variant="contained"
                          onClick={handleInstallKisql}
                          disabled={
                            installKisql.isLoading ||
                            (dep.available && !kisqlUpdateAvailable)
                          }
                          startIcon={
                            installKisql.isLoading ? (
                              <CircularProgress size={16} />
                            ) : (
                              <Download />
                            )
                          }
                        >
                          {/* eslint-disable-next-line no-nested-ternary */}
                          {installKisql.isLoading
                            ? 'Installing...'
                            : dep.available && !kisqlUpdateAvailable
                              ? 'Installed'
                              : kisqlUpdateAvailable
                                ? 'Update'
                                : 'Install'}
                        </Button>
                        {dep.available && (
                          <Tooltip title="Uninstall KiSQL">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() =>
                                setShowKisqlUninstallConfirmation(true)
                              }
                              disabled={uninstallKisql.isLoading}
                            >
                              <Delete fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </>
                    )}
                    {!dep.available &&
                      dep.downloadUrl &&
                      dep.id !== 'kinetica_cli' && (
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<Launch />}
                          onClick={() => window.open(dep.downloadUrl, '_blank')}
                        >
                          Install
                        </Button>
                      )}
                  </Box>
                </ListItemSecondaryAction>
              </ListItem>
              <Divider />
            </React.Fragment>
          ))}
        </List>
      )}

      <ConfirmationModal
        isOpen={showUninstallConfirmation}
        onClose={() => setShowUninstallConfirmation(false)}
        onConfirm={confirmUninstall}
        title="Uninstall Local Runner"
        question="Are you sure you want to uninstall the local runner? You will need to reinstall it to run pipelines locally again."
      />

      <ConfirmationModal
        isOpen={showKisqlUninstallConfirmation}
        onClose={() => setShowKisqlUninstallConfirmation(false)}
        onConfirm={confirmKisqlUninstall}
        title="Uninstall KiSQL"
        question="Are you sure you want to uninstall KiSQL? Pipeline steps using kinetica_cli@v1 will fail until it is reinstalled."
      />
    </Box>
  );
};
