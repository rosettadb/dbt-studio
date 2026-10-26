import React, { useEffect, useState } from 'react';
import { Button, Box, Chip, CircularProgress } from '@mui/material';
import {
  Delete,
  ListAltOutlined,
  WarningAmberOutlined,
  Download,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { SettingsType, PythonVersionInfo } from '../../../types/backend';
import { ConfirmationModal } from '../modals';
import {
  useCheckPythonVersions,
  useInstallPythonVersion,
  useUninstallPython,
} from '../../controllers';
import {
  SettingsRefreshButton,
  SettingsRow,
  SettingsSection,
  SettingsStack,
  SettingsStatus,
} from './SettingsLayout';
import { PythonMonoIcon } from '../notebook/NotebookKindIcon';
import { useActiveInstallTasks, useIsTaskTypeActive } from '../../hooks';
import {
  FINISH_BEFORE_PYTHON_INSTALL_TYPES,
  MANAGED_ENVIRONMENT_INSTALL_TYPES,
  isInstallCancelledError,
} from '../../../shared/installTasks';

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
  const isInstallTaskActive = useIsTaskTypeActive('install:python');

  // A Python switch or uninstall goes ahead of the installs into the managed
  // environment; the confirm popups say what happens to them.
  const environmentInstalls = useActiveInstallTasks().filter((task) =>
    MANAGED_ENVIRONMENT_INSTALL_TYPES.includes(task.type),
  );
  const runningEnvironmentInstall = environmentInstalls.find(
    (task) => task.status === 'running',
  );
  const queuedEnvironmentInstalls = environmentInstalls.filter(
    (task) => task.status === 'pending',
  );
  const plural = (count: number, word: string) =>
    `${count} ${word}${count === 1 ? '' : 's'}`;

  // A switch rebuilds the environment empty: dbt installs are cancelled
  // (adapters need dbt Core, which has to be installed again first), other
  // installs into it run after the switch.
  const describeSwitchEffects = () => {
    const lines: string[] = [];
    const dbtInstalls = environmentInstalls.filter(
      (task) => task.type === 'install:dbt',
    );
    if (dbtInstalls.length > 0) {
      lines.push(
        `${plural(dbtInstalls.length, 'dbt install')} that ${
          dbtInstalls.length === 1 ? 'is' : 'are'
        } queued or running (dbt Core and adapters) will be cancelled and removed.`,
      );
    }
    if (
      runningEnvironmentInstall &&
      runningEnvironmentInstall.type !== 'install:dbt'
    ) {
      lines.push(
        FINISH_BEFORE_PYTHON_INSTALL_TYPES.includes(
          runningEnvironmentInstall.type,
        )
          ? `"${runningEnvironmentInstall.label}" is running now and finishes first.`
          : `The running "${runningEnvironmentInstall.label}" will be stopped and restarts after the switch.`,
      );
    }
    const otherQueued = queuedEnvironmentInstalls.filter(
      (task) => task.type !== 'install:dbt',
    );
    if (otherQueued.length > 0) {
      lines.push(
        `${plural(otherQueued.length, 'other queued install')} will run after the switch.`,
      );
    }
    lines.push(
      'After the switch, install dbt Core first: adapters need dbt Core before they can be installed.',
    );
    return lines.join(' ');
  };

  // An uninstall leaves no environment, so everything for it is cancelled.
  const describeUninstallEffects = () => {
    const lines: string[] = [];
    if (runningEnvironmentInstall) {
      lines.push(
        FINISH_BEFORE_PYTHON_INSTALL_TYPES.includes(
          runningEnvironmentInstall.type,
        )
          ? `"${runningEnvironmentInstall.label}" is running now and finishes first.`
          : `The running "${runningEnvironmentInstall.label}" will be stopped.`,
      );
    }
    if (queuedEnvironmentInstalls.length > 0) {
      lines.push(
        `${plural(queuedEnvironmentInstalls.length, 'queued install')} will be cancelled.`,
      );
    }
    return lines.join(' ');
  };

  const checkVersions = useCheckPythonVersions({
    onSuccess: (data) => setVersionInfo(data),
    onError: (error) => {
      toast.error(`Failed to check Python versions: ${error.message}`);
    },
  });

  const installVersion = useInstallPythonVersion({
    onSuccess: (result) => {
      setInstallingVersion(null);
      if (result.success) {
        toast.success(`Python ${result.version} installed successfully`);
        checkVersions.mutate();
      } else {
        toast.error(`Installation failed: ${result.error}`);
      }
    },
    onError: (error) => {
      setInstallingVersion(null);
      // A cancelled install never started, so it did not fail.
      if (isInstallCancelledError(error)) return;
      toast.error(`Installation failed: ${error.message}`);
    },
  });

  const uninstallPython = useUninstallPython({
    onSuccess: () => {
      toast.success('Python uninstalled successfully');
      setVersionInfo(null);
      checkVersions.mutate();
    },
    onError: (error) => {
      // A cancelled install never started, so it did not fail.
      if (isInstallCancelledError(error)) return;
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
    installVersion.mutate(version);
  };

  const confirmVersionSwitch = () => {
    if (!pendingVersion) return;
    const version = pendingVersion;
    setPendingVersion(null);
    setInstallingVersion(version);
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
    <SettingsStack>
      <SettingsSection
        title="Python Installation"
        icon={<PythonMonoIcon />}
        description="Embedded interpreter, independent of any Python on your system. Runs dbt Core, Flowfile and sqlglot."
      >
        <SettingsRow
          label="Status"
          description={
            isInstalled
              ? settings.pythonPath
              : 'Python is not installed. It will be installed automatically when needed, or you can install the recommended version below.'
          }
        >
          {isInstalled ? (
            <SettingsStatus tone="success">
              Installed · {settings.pythonVersion || 'Unknown'}
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
        {!versionInfo && (
          <SettingsRow
            label={
              checkVersions.isLoading
                ? 'Checking available versions...'
                : 'No version information yet.'
            }
          />
        )}
        {versionInfo?.availableVersions.map((entry) => (
          <SettingsRow
            key={entry.version}
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {entry.version}
                {entry.isRecommended && (
                  <Chip label="Recommended" size="small" variant="outlined" />
                )}
              </Box>
            }
          >
            <Button
              size="small"
              variant="outlined"
              onClick={() => requestInstallVersion(entry.version)}
              disabled={
                entry.version === settings.pythonVersion ||
                installingVersion === entry.version ||
                installVersion.isLoading ||
                isInstallTaskActive
              }
              startIcon={
                installingVersion === entry.version ? (
                  <CircularProgress size={14} />
                ) : (
                  <Download />
                )
              }
            >
              {getButtonLabel(entry.version)}
            </Button>
          </SettingsRow>
        ))}
      </SettingsSection>

      {isInstalled && (
        <SettingsSection title="Danger Zone" icon={<WarningAmberOutlined />}>
          <SettingsRow
            label="Uninstall Python"
            description="Removes the embedded interpreter along with dbt Core (v1 and v2), Flowfile, and sqlglot. You will need to reinstall them. This cannot be undone."
          >
            <Button
              size="small"
              variant="outlined"
              color="error"
              onClick={handleUninstall}
              disabled={uninstallPython.isLoading || isInstallTaskActive}
              startIcon={
                uninstallPython.isLoading ? (
                  <CircularProgress size={14} />
                ) : (
                  <Delete />
                )
              }
            >
              {uninstallPython.isLoading
                ? 'Uninstalling...'
                : 'Uninstall Python'}
            </Button>
          </SettingsRow>
        </SettingsSection>
      )}

      <ConfirmationModal
        isOpen={Boolean(pendingVersion)}
        onClose={cancelVersionSwitch}
        onConfirm={confirmVersionSwitch}
        title="Switch Python Version"
        question={`Are you sure you want to switch to Python ${pendingVersion}? This replaces the managed environment and removes dbt Core, Flowfile, and sqlglot, since they all live inside it. You'll need to reinstall them afterward. ${describeSwitchEffects()}`.trim()}
      />

      <ConfirmationModal
        isOpen={showUninstallConfirmation}
        onClose={cancelUninstall}
        onConfirm={confirmUninstall}
        title="Uninstall Python"
        question={`Are you sure you want to uninstall the embedded Python interpreter? This also removes dbt Core, Flowfile, and sqlglot, since they all live inside the same managed environment. You'll need to reinstall them. ${describeUninstallEffects()}`.trim()}
      />
    </SettingsStack>
  );
};
