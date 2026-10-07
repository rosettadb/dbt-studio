import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Box,
  Chip,
  Typography,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  Backdrop,
  Popover,
} from '@mui/material';
import {
  Delete,
  Download,
  Launch,
  HelpOutline,
  TerminalOutlined,
  ListAltOutlined,
  ExtensionOutlined,
  WarningAmberOutlined,
  Info,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import {
  SettingsType,
  RunnerVersionInfo,
  RunnerPluginId,
} from '../../../types/backend';
import { ConfirmationModal } from '../modals';
import {
  SettingsRefreshButton,
  SettingsRow,
  SettingsSection,
  SettingsSectionBody,
  SettingsStack,
  SettingsStatus,
} from './SettingsLayout';
import {
  useCheckRunnerVersions,
  useInstallRunnerVersion,
  useUninstallRunnerVersion,
  useCheckRunnerPluginDependencies,
  useCheckKisqlVersion,
  useInstallKisql,
  useUninstallKisql,
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
  const [helpAnchor, setHelpAnchor] = useState<{
    el: HTMLElement;
    id: RunnerPluginId;
  } | null>(null);

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
      <Backdrop
        open={isBlocking}
        sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, color: '#fff' }}
      >
        <CircularProgress color="inherit" />
      </Backdrop>

      <SettingsSection
        title="Local Runner"
        icon={<TerminalOutlined />}
        description="Runs rosetta/pipelines/*.yml pipelines on this machine, the same way the cloud runner does on the server."
      >
        <SettingsRow
          label="Status"
          description={
            settings.runnerPath ||
            'The local runner is not installed. Install a version below to enable running pipelines locally.'
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
        title="Available Versions"
        icon={<ListAltOutlined />}
        action={
          <SettingsRefreshButton
            title="Refresh versions"
            onClick={() => checkVersions.mutate()}
            loading={checkVersions.isLoading}
          />
        }
      >
        {(!versionInfo || versionInfo.availableVersions.length === 0) && (
          <SettingsRow
            label={
              (checkVersions.isLoading && 'Loading available versions...') ||
              (versionInfo
                ? 'No versions available.'
                : 'No version information yet.')
            }
          />
        )}
        {versionInfo?.availableVersions.slice(0, 10).map((version) => (
          <SettingsRow
            key={version.version}
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {version.version}
                {version.version === versionInfo.latestStable && (
                  <Chip label="Latest" size="small" variant="outlined" />
                )}
              </Box>
            }
            description={`Released: ${new Date(
              version.releaseDate,
            ).toLocaleDateString()}`}
          >
            {version.releaseNotes && (
              <Tooltip title="View release notes">
                <IconButton
                  size="small"
                  onClick={() =>
                    window.open(
                      `https://github.com/rosettadb/dbt-studio/releases/tag/${version.version}`,
                      '_blank',
                    )
                  }
                >
                  <Info fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <Button
              size="small"
              variant="outlined"
              onClick={() => handleInstallVersion(version.version)}
              disabled={
                version.version === versionInfo.currentVersion ||
                installingVersion === version.version ||
                installVersion.isLoading
              }
              startIcon={
                installingVersion === version.version ? (
                  <CircularProgress size={14} />
                ) : (
                  <Download />
                )
              }
            >
              {getButtonText(version)}
            </Button>
          </SettingsRow>
        ))}
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
                      disabled={uninstallKisql.isLoading}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </>
            )}
            {!dep.available && dep.downloadUrl && dep.id !== 'kinetica_cli' && (
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

      {settings.runnerPath && (
        <SettingsSection title="Danger Zone" icon={<WarningAmberOutlined />}>
          <SettingsRow
            label="Uninstall Local Runner"
            description="You will need to reinstall it to run pipelines locally again."
          >
            <Button
              size="small"
              variant="outlined"
              color="error"
              onClick={() => setShowUninstallConfirmation(true)}
              disabled={uninstallRunner.isLoading}
              startIcon={
                uninstallRunner.isLoading ? (
                  <CircularProgress size={14} />
                ) : (
                  <Delete />
                )
              }
            >
              {uninstallRunner.isLoading
                ? 'Uninstalling...'
                : 'Uninstall Local Runner'}
            </Button>
          </SettingsRow>
        </SettingsSection>
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
