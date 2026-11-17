import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Box,
  Typography,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  IconButton,
  Tooltip,
  Popover,
} from '@mui/material';
import {
  Delete,
  Download,
  Launch,
  HelpOutline,
  TerminalOutlined,
  ExtensionOutlined,
  Info,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { SettingsType, RunnerPluginId } from '../../../types/backend';
import { ConfirmationModal } from '../modals';
import { useIsTaskTypeActive } from '../../hooks';
import { isInstallCancelledError } from '../../../shared/installTasks';
import {
  SettingsRow,
  SettingsSection,
  SettingsSectionBody,
  SettingsStack,
  SettingsStatus,
} from './SettingsLayout';
import {
  useCheckRunnerPluginDependencies,
  useCheckKisqlVersion,
  useInstallKisql,
  useUninstallKisql,
  useInstallPySpark,
  useUninstallPySpark,
} from '../../controllers';

// Manual-install guidance shown in the help popover for deps that have no
// in-app installer.
const MANUAL_INSTALL_HELP: Partial<
  Record<RunnerPluginId, { title: string; steps: string[] }>
> = {
  git: {
    title: 'Installing Git',
    steps: [
      'macOS: run  xcode-select --install  or install via https://git-scm.com/downloads',
      'Linux: sudo apt install git  (Debian/Ubuntu) or  sudo dnf install git  (Fedora)',
      'Windows: download the installer from https://git-scm.com/downloads',
      'After install, restart dbt Studio so the new PATH is picked up.',
    ],
  },
  terraform: {
    title: 'Installing Terraform',
    steps: [
      'macOS/Linux: use Homebrew —  brew tap hashicorp/tap && brew install hashicorp/tap/terraform',
      'Or download the binary directly from https://developer.hashicorp.com/terraform/install',
      'Windows: use the MSI installer linked on the download page above.',
      'After install, restart dbt Studio so the new PATH is picked up.',
    ],
  },
  s3: {
    title: 'Installing AWS CLI',
    steps: [
      'macOS: brew install awscli',
      'Linux: follow the official guide at https://aws.amazon.com/cli/',
      'Windows: download the MSI installer from https://aws.amazon.com/cli/',
      'After install, restart dbt Studio so the new PATH is picked up.',
    ],
  },
};

function describeJavaRequirement(
  version?: string,
  available?: boolean,
): string {
  if (!version) {
    return 'Java was not found. PySpark requires Java 17 or newer. Install a JDK, then restart Studio.';
  }
  if (available) {
    return `Java ${version} is available. PySpark requires Java 17 or newer.`;
  }
  return `Java ${version} was found. PySpark requires Java 17 or newer. Install a newer JDK, then restart Studio.`;
}

interface RunnerSettingsProps {
  settings: SettingsType;
}

export const RunnerSettings: React.FC<RunnerSettingsProps> = ({ settings }) => {
  const navigate = useNavigate();
  const [showKisqlUninstallConfirmation, setShowKisqlUninstallConfirmation] =
    useState(false);
  const [
    showPySparkUninstallConfirmation,
    setShowPySparkUninstallConfirmation,
  ] = useState(false);
  const isInstallTaskActive = useIsTaskTypeActive('install:runner');
  const isPySparkInstallTaskActive = useIsTaskTypeActive('install:pyspark');
  const [kisqlUpdateAvailable, setKisqlUpdateAvailable] = useState(false);
  const [javaInfoOpen, setJavaInfoOpen] = useState(false);
  const [helpAnchor, setHelpAnchor] = useState<{
    el: HTMLElement;
    id: RunnerPluginId;
  } | null>(null);

  const pluginDependencies = useCheckRunnerPluginDependencies({
    onError: (error) => {
      toast.error(`Failed to check plugin dependencies: ${error.message}`);
    },
  });
  const javaStatus = pluginDependencies.data?.find(
    (dependency) => dependency.id === 'pyspark',
  )?.java;

  // KiSQL hooks
  const checkKisql = useCheckKisqlVersion({
    onSuccess: (data) => {
      setKisqlUpdateAvailable(data.updateAvailable ?? false);
    },
  });

  const installKisql = useInstallKisql({
    onSuccess: (result) => {
      if (result.success) {
        toast.success('KiSQL installed successfully');
        pluginDependencies.mutate();
        checkKisql.mutate();
      } else {
        toast.error(`KiSQL installation failed: ${result.error}`);
      }
    },
    onError: (error) => {
      // A cancelled install never started, so it did not fail.
      if (isInstallCancelledError(error)) return;
      toast.error(`KiSQL installation failed: ${error.message}`);
    },
  });

  const installPySpark = useInstallPySpark({
    onSuccess: () => {
      toast.success('PySpark installed successfully');
      pluginDependencies.mutate();
    },
    onError: (error) => {
      if (isInstallCancelledError(error)) return;
      toast.error(`PySpark installation failed: ${error.message}`);
    },
  });

  const uninstallPySpark = useUninstallPySpark({
    onSuccess: () => {
      toast.success('PySpark uninstalled');
      pluginDependencies.mutate();
    },
    onError: (error) => {
      if (isInstallCancelledError(error)) return;
      toast.error(`PySpark uninstall failed: ${error.message}`);
    },
  });

  const uninstallKisql = useUninstallKisql({
    onSuccess: () => {
      setKisqlUpdateAvailable(false);
      toast.success('KiSQL uninstalled');
      pluginDependencies.mutate();
    },
    onError: (error) => {
      // A cancelled install never started, so it did not fail.
      if (isInstallCancelledError(error)) return;
      toast.error(`KiSQL uninstall failed: ${error.message}`);
    },
  });

  useEffect(() => {
    pluginDependencies.mutate();
    checkKisql.mutate();
  }, []);

  const confirmPySparkUninstall = () => {
    setShowPySparkUninstallConfirmation(false);
    uninstallPySpark.mutate();
  };

  const handleInstallKisql = () => {
    installKisql.mutate();
  };

  const confirmKisqlUninstall = () => {
    setShowKisqlUninstallConfirmation(false);
    uninstallKisql.mutate();
  };

  const getKisqlButtonLabel = (
    isLoading: boolean,
    isAvailable: boolean,
    hasUpdate: boolean,
  ): string => {
    if (isLoading) return 'Installing...';
    if (isAvailable && !hasUpdate) return 'Installed';
    if (hasUpdate) return 'Update';
    return 'Install';
  };

  return (
    <SettingsStack>
      <SettingsSection
        title="Local Runner"
        icon={<TerminalOutlined />}
        description="Runs rosetta/pipelines/*.yml pipelines on this machine, the same way the cloud runner does on the server."
      >
        <SettingsRow
          label="Status"
          description={
            settings.runnerPath ||
            'The local runner is not available on this machine. It comes with the dbt Studio installer.'
          }
        >
          {settings.runnerPath ? (
            <SettingsStatus tone="success">
              Installed · {settings.runnerVersion || 'Unknown'}
            </SettingsStatus>
          ) : (
            <SettingsStatus tone="warning">Not installed</SettingsStatus>
          )}
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Plugin Dependencies"
        icon={<ExtensionOutlined />}
        description="Pipeline steps shell out to these tools. A step fails at run time if its tool isn't available."
      >
        {pluginDependencies.isLoading && (
          <SettingsSectionBody>
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <CircularProgress size={24} />
            </Box>
          </SettingsSectionBody>
        )}
        {pluginDependencies.data?.map((dep) => (
          <SettingsRow
            key={dep.id}
            label={
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  flexWrap: 'wrap',
                }}
              >
                {dep.label}
                {dep.available ? (
                  <SettingsStatus tone="success">
                    {dep.version ? `v${dep.version}` : 'Available'}
                  </SettingsStatus>
                ) : (
                  <SettingsStatus tone="warning">Not found</SettingsStatus>
                )}
                {dep.id === 'kinetica_cli' && kisqlUpdateAvailable && (
                  <SettingsStatus tone="info">Update available</SettingsStatus>
                )}
                {dep.id === 'pyspark' && dep.java && !dep.java.available && (
                  <SettingsStatus tone="warning">
                    Java 17+ required
                  </SettingsStatus>
                )}
              </Box>
            }
            description={
              <Box
                component="span"
                sx={{
                  display: 'block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                Plugin: {dep.plugin}
                {dep.path ? ` · ${dep.path}` : ''}
              </Box>
            }
          >
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
                  variant="outlined"
                  onClick={handleInstallKisql}
                  disabled={
                    installKisql.isLoading ||
                    isInstallTaskActive ||
                    (dep.available && !kisqlUpdateAvailable)
                  }
                  startIcon={
                    installKisql.isLoading ? (
                      <CircularProgress size={14} />
                    ) : (
                      <Download />
                    )
                  }
                >
                  {getKisqlButtonLabel(
                    installKisql.isLoading,
                    dep.available,
                    kisqlUpdateAvailable,
                  )}
                </Button>
                {dep.available && (
                  <Tooltip title="Uninstall KiSQL">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => setShowKisqlUninstallConfirmation(true)}
                      disabled={uninstallKisql.isLoading || isInstallTaskActive}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </>
            )}
            {dep.id === 'pyspark' && (
              <>
                <Tooltip title="Java requirement">
                  <IconButton
                    size="small"
                    onClick={() => setJavaInfoOpen(true)}
                  >
                    <Info fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => installPySpark.mutate()}
                  disabled={
                    dep.available ||
                    installPySpark.isLoading ||
                    uninstallPySpark.isLoading ||
                    isPySparkInstallTaskActive
                  }
                  startIcon={
                    installPySpark.isLoading ? (
                      <CircularProgress size={14} />
                    ) : (
                      <Download />
                    )
                  }
                >
                  {dep.available ? 'Installed' : 'Install'}
                </Button>
                {dep.managedInStudio && (
                  <Tooltip title="Uninstall PySpark">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => setShowPySparkUninstallConfirmation(true)}
                      disabled={
                        installPySpark.isLoading ||
                        uninstallPySpark.isLoading ||
                        isPySparkInstallTaskActive
                      }
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </>
            )}
            {!dep.available &&
              dep.downloadUrl &&
              dep.id !== 'kinetica_cli' &&
              dep.id !== 'pyspark' && (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Launch />}
                  onClick={() => window.open(dep.downloadUrl, '_blank')}
                >
                  Install
                </Button>
              )}
            {dep.id !== 'kinetica_cli' &&
              dep.id !== 'dbt' &&
              dep.id !== 'rosetta' &&
              dep.id !== 'command' &&
              MANUAL_INSTALL_HELP[dep.id] && (
                <Tooltip title="Installation help">
                  <IconButton
                    size="small"
                    onClick={(e) =>
                      setHelpAnchor({ el: e.currentTarget, id: dep.id })
                    }
                  >
                    <HelpOutline fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
          </SettingsRow>
        ))}
      </SettingsSection>

      <ConfirmationModal
        isOpen={showKisqlUninstallConfirmation}
        onClose={() => setShowKisqlUninstallConfirmation(false)}
        onConfirm={confirmKisqlUninstall}
        title="Uninstall KiSQL"
        question="Are you sure you want to uninstall KiSQL? Pipeline steps using kinetica_cli@v1 will fail until it is reinstalled."
      />

      <ConfirmationModal
        isOpen={showPySparkUninstallConfirmation}
        onClose={() => setShowPySparkUninstallConfirmation(false)}
        onConfirm={confirmPySparkUninstall}
        title="Uninstall PySpark"
        question="Are you sure you want to uninstall PySpark from Studio Python? Local pipeline steps using pyspark@v1 will fail until it is reinstalled."
      />

      <Dialog open={javaInfoOpen} onClose={() => setJavaInfoOpen(false)}>
        <DialogTitle>Java required for PySpark</DialogTitle>
        <DialogContent>
          <Typography>
            {describeJavaRequirement(
              javaStatus?.version,
              javaStatus?.available,
            )}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setJavaInfoOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Manual-install help popover */}
      <Popover
        open={Boolean(helpAnchor)}
        anchorEl={helpAnchor?.el}
        onClose={() => setHelpAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{ sx: { p: 2, maxWidth: 380 } }}
      >
        {helpAnchor && MANUAL_INSTALL_HELP[helpAnchor.id] && (
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
              {MANUAL_INSTALL_HELP[helpAnchor.id]!.title}
            </Typography>
            <Alert severity="info" sx={{ mb: 1.5, py: 0 }}>
              <Typography variant="caption">
                Requires manual installation — no in-app installer available.
              </Typography>
            </Alert>
            <Box component="ol" sx={{ m: 0, pl: 2 }}>
              {MANUAL_INSTALL_HELP[helpAnchor.id]!.steps.map((step) => (
                <Typography
                  key={step}
                  component="li"
                  variant="body2"
                  sx={{ mb: 0.5 }}
                >
                  {step}
                </Typography>
              ))}
            </Box>
          </Box>
        )}
      </Popover>
    </SettingsStack>
  );
};
