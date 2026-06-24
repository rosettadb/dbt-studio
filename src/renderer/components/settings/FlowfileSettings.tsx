import React from 'react';
import {
  Box,
  Typography,
  Button,
  Alert,
  CircularProgress,
  Chip,
  Divider,
  Backdrop,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  CheckCircle,
  CloudDownload,
  Delete,
  Refresh,
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

interface FlowfileSettingsProps {
  settings: SettingsType;
  onSettingsChange: (name: string, value: string) => void;
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

  const handleInstall = async () => {
    if (!settings.pythonPath) {
      setInstallError(
        'Python path not configured. Set it in Settings > General first.',
      );
      return;
    }
    setIsInstalling(true);
    setInstallError(null);
    setIsLoadingDialog(true);
    setLoadingMessage('Installing Flowfile...');
    try {
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Status */}
      <Box>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            mb: 1,
          }}
        >
          <Typography variant="subtitle1" fontWeight="medium">
            Installation Status
          </Typography>
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
        </Box>

        {!isPythonConfigured && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Python path not configured. Go to{' '}
            <strong>Settings &gt; General</strong> and set the Python path
            first.
          </Alert>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
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
        </Box>
      </Box>

      {/* Auto-start toggle */}
      <FormControlLabel
        control={
          <Switch
            checked={autoStart}
            onChange={(_, checked) => handleAutoStartChange(checked)}
          />
        }
        label="Auto-start Flowfile on app launch"
      />

      <Divider />

      {/* Install / Upgrade */}
      <Box>
        <Typography variant="subtitle1" fontWeight="medium" gutterBottom>
          {installedVersion ? 'Upgrade Flowfile' : 'Install Flowfile'}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Installs <code>Flowfile</code> via <code>pip</code> into the
          configured Python environment. Requires Python path to be set.
        </Typography>

        {installError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {installError}
          </Alert>
        )}

        <Button
          variant="contained"
          startIcon={
            isInstalling ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <CloudDownload />
            )
          }
          onClick={handleInstall}
          disabled={isInstalling || !isPythonConfigured}
        >
          {isInstalling && 'Installing…'}
          {!isInstalling && installedVersion && 'Upgrade Flowfile'}
          {!isInstalling && !installedVersion && 'Install Flowfile'}
        </Button>
      </Box>

      {installedVersion && (
        <>
          <Divider />
          <Box sx={{ pt: 1, borderTop: 0 }}>
            <Typography
              variant="subtitle1"
              fontWeight="medium"
              color="error"
              gutterBottom
            >
              Danger Zone
            </Typography>
            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography variant="body2">
                Uninstalling Flowfile will remove it from your Python
                environment.
              </Typography>
            </Alert>
            <Button
              variant="outlined"
              color="error"
              onClick={() => setShowUninstallConfirmation(true)}
              disabled={isUninstalling}
              startIcon={
                isUninstalling ? <CircularProgress size={16} /> : <Delete />
              }
            >
              {isUninstalling ? 'Uninstalling...' : 'Uninstall Flowfile'}
            </Button>
          </Box>
        </>
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
    </Box>
  );
};
