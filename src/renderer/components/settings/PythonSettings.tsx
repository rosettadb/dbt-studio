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
import { useIsTaskTypeActive } from '../../hooks';

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

  const checkVersions = useCheckPythonVersions({
    onSuccess: (data) => setVersionInfo(data),
    onError: (error) => {
      toast.error(`Failed to check Python versions: ${error.message}`);
    },
  });

  const installVersion = useInstallPythonVersion({
    onSuccess: (result) => {
      setInstallingVersion(null);
      if (result.success) checkVersions.mutate();
    },
    onError: () => {
      setInstallingVersion(null);
    },
  });

  const uninstallPython = useUninstallPython({
    onSuccess: () => {
      setVersionInfo(null);
      checkVersions.mutate();
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
        question={`Are you sure you want to switch to Python ${pendingVersion}? This replaces the managed environment and removes dbt Core, Flowfile, and sqlglot, since they all live inside it. You'll need to reinstall them afterward.`}
      />

      <ConfirmationModal
        isOpen={showUninstallConfirmation}
        onClose={cancelUninstall}
        onConfirm={confirmUninstall}
        title="Uninstall Python"
        question="Are you sure you want to uninstall the embedded Python interpreter? This also removes dbt Core, Flowfile, and sqlglot, since they all live inside the same managed environment. You'll need to reinstall them."
      />
    </SettingsStack>
  );
};
