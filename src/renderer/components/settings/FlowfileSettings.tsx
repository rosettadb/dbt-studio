import React from 'react';
import { Button, Alert, CircularProgress, Switch } from '@mui/material';
import {
  CloudDownload,
  Delete,
  AccountTreeOutlined,
  WarningAmberOutlined,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { SettingsType } from '../../../types/backend';
import {
  flowfileInstall,
  flowfileUninstall,
  flowfileGetStatus,
  FlowfileStatus,
} from '../../services/flowfile.service';
import { ConfirmationModal } from '../modals';
import { useInstallPython } from '../../controllers';
import { useIsTaskTypeActive } from '../../hooks';
import { isInstallCancelledError } from '../../../shared/installTasks';
import {
  SettingsRefreshButton,
  SettingsRow,
  SettingsSection,
  SettingsSectionBody,
  SettingsStack,
  SettingsStatus,
} from './SettingsLayout';

interface FlowfileSettingsProps {
  settings: SettingsType;
  onSettingsChange: (name: string, value: string) => Promise<void>;
}

export const FlowfileSettings: React.FC<FlowfileSettingsProps> = ({
  settings,
  onSettingsChange,
}) => {
  const [status, setStatus] = React.useState<FlowfileStatus | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = React.useState(false);
  const [isInstalling, setIsInstalling] = React.useState(false);
  const [installError, setInstallError] = React.useState<string | null>(null);
  const [isUninstalling, setIsUninstalling] = React.useState(false);
  const [showUninstallConfirmation, setShowUninstallConfirmation] =
    React.useState(false);
  const [autoStart, setAutoStart] = React.useState(
    () => settings.flowfileAutoStart === 'true',
  );
  // Flowfile installs Python first when it is missing, so a running Python
  // install also counts as busy here.
  const isInstallTaskActive = useIsTaskTypeActive(
    'install:flowfile',
    'install:python',
  );

  // Installs keep running after this page closes, and the background process
  // saves their results itself. A closed page's settings copy is out of date,
  // so it must not save over them.
  const isPageOpenRef = React.useRef(true);
  React.useEffect(() => {
    isPageOpenRef.current = true;
    return () => {
      isPageOpenRef.current = false;
    };
  }, []);
  const checkStatus = async () => {
    setIsCheckingStatus(true);
    try {
      const s = await flowfileGetStatus();
      setStatus(s);
      const nextVersion = s.version ?? '';
      if (
        isPageOpenRef.current &&
        nextVersion !== (settings.flowfileVersion ?? '')
      ) {
        onSettingsChange('flowfileVersion', nextVersion);
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to check Flowfile status',
      );
    } finally {
      setIsCheckingStatus(false);
    }
  };

  React.useEffect(() => {
    checkStatus();
  }, []);

  React.useEffect(() => {
    setAutoStart(settings.flowfileAutoStart === 'true');
  }, [settings.flowfileAutoStart]);

  const handleAutoStartChange = (checked: boolean) => {
    setAutoStart(checked);
    onSettingsChange('flowfileAutoStart', checked ? 'true' : 'false');
  };

  const installPython = useInstallPython();

  const handleInstall = async () => {
    setIsInstalling(true);
    setInstallError(null);
    try {
      if (!settings.pythonPath) {
        toast.info(
          'Python is required for Flowfile and will be installed automatically.',
        );
        const pythonResult = await installPython.mutateAsync();
        if (!pythonResult.success) {
          setInstallError(`Failed to install Python: ${pythonResult.error}`);
          return;
        }
        if (isPageOpenRef.current) {
          await onSettingsChange('pythonPath', pythonResult.path);
          await onSettingsChange('pythonVersion', pythonResult.version);
        }
      }

      const result = await flowfileInstall();
      if (result.ok) {
        await checkStatus();
      } else {
        setInstallError(result.error ?? 'Installation failed');
      }
    } catch (error) {
      if (!isInstallCancelledError(error)) {
        setInstallError(
          error instanceof Error ? error.message : 'Installation failed',
        );
      }
    } finally {
      setIsInstalling(false);
    }
  };

  const handleUninstall = async () => {
    setShowUninstallConfirmation(false);
    setIsUninstalling(true);
    try {
      const result = await flowfileUninstall();
      if (result.ok) {
        if (isPageOpenRef.current) onSettingsChange('flowfileVersion', '');
        await checkStatus();
      }
    } catch {
      // The task manager shows the failure (or the cancel) in a popup.
    } finally {
      setIsUninstalling(false);
    }
  };

  const installedVersion = status?.version ?? settings.flowfileVersion ?? null;
  const isPythonConfigured = Boolean(settings.pythonPath);

  return (
    <SettingsStack>
      {!isPythonConfigured && (
        <Alert severity="info">
          Python is not installed yet. Installing Flowfile below will install it
          automatically, or you can install it first from{' '}
          <strong>Settings &gt; Python</strong>.
        </Alert>
      )}

      <SettingsSection
        title="Flowfile"
        icon={<AccountTreeOutlined />}
        action={
          <SettingsRefreshButton
            title="Refresh status"
            onClick={checkStatus}
            loading={isCheckingStatus}
          />
        }
      >
        <SettingsRow label="Installation Status">
          {installedVersion ? (
            <SettingsStatus tone="success">
              Installed · {installedVersion}
            </SettingsStatus>
          ) : (
            <SettingsStatus tone="neutral">Not installed</SettingsStatus>
          )}
        </SettingsRow>
        <SettingsRow label="Auto-start Flowfile on app launch">
          <Switch
            size="small"
            checked={autoStart}
            onChange={(_, checked) => handleAutoStartChange(checked)}
          />
        </SettingsRow>
        <SettingsRow
          label={installedVersion ? 'Upgrade Flowfile' : 'Install Flowfile'}
          description={
            <>
              Installs <code>Flowfile</code> via <code>pip</code> into the
              managed Python environment.
              {!isPythonConfigured &&
                ' Python will be installed automatically first.'}
            </>
          }
        >
          <Button
            size="small"
            variant="outlined"
            startIcon={
              isInstalling ? (
                <CircularProgress size={14} color="inherit" />
              ) : (
                <CloudDownload />
              )
            }
            onClick={handleInstall}
            disabled={isInstalling || isInstallTaskActive}
          >
            {isInstalling && 'Installing…'}
            {!isInstalling && installedVersion && 'Upgrade Flowfile'}
            {!isInstalling && !installedVersion && 'Install Flowfile'}
          </Button>
        </SettingsRow>
        {installError && (
          <SettingsSectionBody>
            <Alert severity="error">{installError}</Alert>
          </SettingsSectionBody>
        )}
      </SettingsSection>

      {installedVersion && (
        <SettingsSection title="Danger Zone" icon={<WarningAmberOutlined />}>
          <SettingsRow
            label="Uninstall Flowfile"
            description="Removes Flowfile from your Python environment."
          >
            <Button
              size="small"
              variant="outlined"
              color="error"
              onClick={() => setShowUninstallConfirmation(true)}
              disabled={isUninstalling || isInstallTaskActive}
              startIcon={
                isUninstalling ? <CircularProgress size={14} /> : <Delete />
              }
            >
              {isUninstalling ? 'Uninstalling...' : 'Uninstall Flowfile'}
            </Button>
          </SettingsRow>
        </SettingsSection>
      )}

      <ConfirmationModal
        isOpen={showUninstallConfirmation}
        onClose={() => setShowUninstallConfirmation(false)}
        onConfirm={handleUninstall}
        title="Uninstall Flowfile"
        question="Are you sure you want to uninstall Flowfile? This will remove it from your Python environment and you will need to reinstall it to use Flowfile features."
      />
    </SettingsStack>
  );
};
