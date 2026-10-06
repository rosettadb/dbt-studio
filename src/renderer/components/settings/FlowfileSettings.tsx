import React from 'react';
import {
  Box,
  Typography,
  Button,
  Alert,
  CircularProgress,
  Chip,
  Backdrop,
  Switch,
} from '@mui/material';
import {
  CheckCircle,
  CloudDownload,
  Delete,
  Refresh,
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
import {
  SettingsRow,
  SettingsSection,
  SettingsSectionBody,
  SettingsStack,
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
  const [isLoadingDialog, setIsLoadingDialog] = React.useState(false);
  const [loadingMessage, setLoadingMessage] = React.useState('');
  const [isUninstalling, setIsUninstalling] = React.useState(false);
  const [showUninstallConfirmation, setShowUninstallConfirmation] =
    React.useState(false);
  const [autoStart, setAutoStart] = React.useState(
    () => settings.flowfileAutoStart === 'true',
  );
  const checkStatus = async () => {
    setIsCheckingStatus(true);
    try {
      const s = await flowfileGetStatus();
      setStatus(s);
      const nextVersion = s.version ?? '';
      if (nextVersion !== (settings.flowfileVersion ?? '')) {
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
    setIsLoadingDialog(true);
    setLoadingMessage('Installing Flowfile...');
    try {
      if (!settings.pythonPath) {
        toast.info(
          'Python is required for Flowfile and will be installed automatically.',
        );
        setLoadingMessage('Installing Python...');
        const pythonResult = await installPython.mutateAsync();
        if (!pythonResult.success) {
          setInstallError(`Failed to install Python: ${pythonResult.error}`);
          return;
        }
        await onSettingsChange('pythonPath', pythonResult.path);
        await onSettingsChange('pythonVersion', pythonResult.version);
        setLoadingMessage('Installing Flowfile...');
      }

      const result = await flowfileInstall();
      if (result.ok) {
        toast.success('Flowfile installed successfully');
        await checkStatus();
      } else {
        setInstallError(result.error ?? 'Installation failed');
      }
    } catch (error) {
      setInstallError(
        error instanceof Error ? error.message : 'Installation failed',
      );
    } finally {
      setIsInstalling(false);
      setIsLoadingDialog(false);
      setLoadingMessage('');
    }
  };

  const handleUninstall = async () => {
    setShowUninstallConfirmation(false);
    setIsUninstalling(true);
    setIsLoadingDialog(true);
    setLoadingMessage('Uninstalling Flowfile...');
    try {
      const result = await flowfileUninstall();
      if (result.ok) {
        toast.success('Flowfile uninstalled successfully');
        onSettingsChange('flowfileVersion', '');
        await checkStatus();
      } else {
        toast.error(result.error ?? 'Uninstall failed');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Uninstall failed');
    } finally {
      setIsUninstalling(false);
      setIsLoadingDialog(false);
      setLoadingMessage('');
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
          <Button
            size="small"
            startIcon={
              isCheckingStatus ? (
                <CircularProgress size={12} />
              ) : (
                <Refresh fontSize="small" />
              )
            }
            onClick={checkStatus}
            disabled={isCheckingStatus}
          >
            Refresh
          </Button>
        }
      >
        <SettingsRow label="Installation Status">
          {installedVersion ? (
            <Chip
              icon={<CheckCircle fontSize="small" />}
              label={`Flowfile ${installedVersion}`}
              color="success"
              variant="outlined"
              size="small"
            />
          ) : (
            <Chip
              label="Not installed"
              color="default"
              variant="outlined"
              size="small"
            />
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
            disabled={isInstalling}
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
              disabled={isUninstalling}
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

      <Backdrop
        open={isLoadingDialog}
        sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, color: '#fff' }}
      >
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          py={3}
        >
          <CircularProgress color="inherit" />
          <Typography variant="body2" sx={{ mt: 2, textAlign: 'center' }}>
            {loadingMessage || 'Loading...'}
          </Typography>
        </Box>
      </Backdrop>
    </SettingsStack>
  );
};
