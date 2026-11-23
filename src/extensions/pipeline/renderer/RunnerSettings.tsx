import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Box,
  Typography,
  Alert,
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
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { SettingsType } from '../../../extensionApi/studio/types';
import { RunnerRequirementStatus } from '../../../extensionApi/studio/pipelineShared';
import { ConfirmationModal } from '../../../extensionApi/studio/modals';
import { useIsTaskTypeActive } from '../../../extensionApi/studio/hooks';
import { isInstallCancelledError } from '../../../extensionApi/studio/installTasks';
import {
  SettingsRow,
  SettingsSection,
  SettingsSectionBody,
  SettingsStack,
  SettingsStatus,
} from '../../../extensionApi/studio/settingsLayout';
import {
  useCheckRunnerRequirements,
  useCheckKisqlVersion,
  useInstallKisql,
  useUninstallKisql,
  useInstallPySpark,
  useUninstallPySpark,
} from './pipelineControllers';

// Which tools the plugins need, how each is checked and how it is installed
// come from the runner's plugin manifest (`requires`). For a tool the
// manifest marks as installed by Studio, the buttons below start the
// installer Studio has for it: its own settings page (method "studio"),
// KiSQL (a "download" with id "kisql") or PySpark (the "pip" package
// "pyspark"). Any other tool gets its link and, when given, instructions.
const hasSettingsPage = (dep: RunnerRequirementStatus) =>
  dep.install.type === 'auto' && dep.install.method === 'studio';
const isKisql = (dep: RunnerRequirementStatus) =>
  dep.install.type === 'auto' &&
  dep.install.method === 'download' &&
  dep.id === 'kisql';
const isPySpark = (dep: RunnerRequirementStatus) =>
  dep.install.type === 'auto' &&
  dep.install.method === 'pip' &&
  dep.install.package === 'pyspark';

const currentOs = (): 'darwin' | 'win32' | 'linux' => {
  const platform = window.navigator.platform.toLowerCase();
  if (platform.includes('mac')) return 'darwin';
  if (platform.includes('win')) return 'win32';
  return 'linux';
};

// The manifest's install steps for this OS, then the ones for every OS.
const installSteps = (dep: RunnerRequirementStatus): string[] => {
  const instructions = dep.install.instructions ?? {};
  return [...(instructions[currentOs()] ?? []), ...(instructions.all ?? [])];
};

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
  const [helpAnchor, setHelpAnchor] = useState<{
    el: HTMLElement;
    dep: RunnerRequirementStatus;
  } | null>(null);

  const pluginDependencies = useCheckRunnerRequirements({
    onError: (error) => {
      toast.error(`Failed to check plugin dependencies: ${error.message}`);
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
        {pluginDependencies.data?.length === 0 && (
          <SettingsSectionBody>
            <Typography variant="body2" color="text.secondary">
              No plugin dependencies. They are listed by the local runner.
            </Typography>
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
                {dep.available && (
                  <SettingsStatus tone="success">
                    {dep.version ? `v${dep.version}` : 'Available'}
                  </SettingsStatus>
                )}
                {!dep.available && dep.version && (
                  <SettingsStatus tone="warning">
                    v{dep.version} found, {dep.check.minVersion}+ required
                  </SettingsStatus>
                )}
                {!dep.available && !dep.version && (
                  <SettingsStatus tone="warning">Not found</SettingsStatus>
                )}
                {isKisql(dep) && kisqlUpdateAvailable && (
                  <SettingsStatus tone="info">Update available</SettingsStatus>
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
                {dep.plugins.length > 1 ? 'Plugins' : 'Plugin'}:{' '}
                {dep.plugins.join(', ')}
                {dep.path ? ` · ${dep.path}` : ''}
              </Box>
            }
          >
            {hasSettingsPage(dep) && (
              <Button
                size="small"
                variant="outlined"
                onClick={() => navigate(`/app/settings/${dep.id}`)}
              >
                Manage
              </Button>
            )}
            {isKisql(dep) && (
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
            {isPySpark(dep) && (
              <>
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
              dep.install.url &&
              !hasSettingsPage(dep) &&
              !isKisql(dep) &&
              !isPySpark(dep) && (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Launch />}
                  onClick={() => window.open(dep.install.url, '_blank')}
                >
                  Install
                </Button>
              )}
            {installSteps(dep).length > 0 && (
              <Tooltip title="Installation help">
                <IconButton
                  size="small"
                  onClick={(e) => setHelpAnchor({ el: e.currentTarget, dep })}
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
        question="Are you sure you want to uninstall KiSQL? Pipeline steps that use it will fail until it is reinstalled."
      />

      <ConfirmationModal
        isOpen={showPySparkUninstallConfirmation}
        onClose={() => setShowPySparkUninstallConfirmation(false)}
        onConfirm={confirmPySparkUninstall}
        title="Uninstall PySpark"
        question="Are you sure you want to uninstall PySpark from Studio Python? Local pipeline steps that use it will fail until it is reinstalled."
      />

      {/* Manual-install help popover */}
      <Popover
        open={Boolean(helpAnchor)}
        anchorEl={helpAnchor?.el}
        onClose={() => setHelpAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{ sx: { p: 2, maxWidth: 380 } }}
      >
        {helpAnchor && (
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
              Installing {helpAnchor.dep.label}
            </Typography>
            {helpAnchor.dep.install.type === 'manual' && (
              <Alert severity="info" sx={{ mb: 1.5, py: 0 }}>
                <Typography variant="caption">
                  Requires manual installation — no in-app installer available.
                </Typography>
              </Alert>
            )}
            <Box component="ol" sx={{ m: 0, pl: 2 }}>
              {installSteps(helpAnchor.dep).map((step) => (
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
