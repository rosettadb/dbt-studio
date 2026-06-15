import React from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Alert,
  CircularProgress,
  Chip,
  Divider,
} from '@mui/material';
import {
  CheckCircle,
  CloudDownload,
  Refresh,
} from '@mui/icons-material';
import { SettingsType } from '../../../types/backend';
import { useUpdateSettings } from '../../controllers';
import {
  flowfileInstall,
  flowfileGetStatus,
  FlowfileStatus,
} from '../../services/flowfile.service';
import { toast } from 'react-toastify';

interface FlowfileSettingsProps {
  settings: SettingsType;
  onSettingsChange: (name: string, value: string) => void;
}

export const FlowfileSettings: React.FC<FlowfileSettingsProps> = ({
  settings,
  onSettingsChange,
}) => {
  const { mutate: updateSettings } = useUpdateSettings();

  const [status, setStatus] = React.useState<FlowfileStatus | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = React.useState(false);
  const [isInstalling, setIsInstalling] = React.useState(false);
  const [installError, setInstallError] = React.useState<string | null>(null);

  const port = settings.flowfilePort ?? '63578';

  const checkStatus = async () => {
    setIsCheckingStatus(true);
    try {
      const s = await flowfileGetStatus();
      setStatus(s);
      if (s.version && s.version !== settings.flowfileVersion) {
        onSettingsChange('flowfileVersion', s.version);
      }
    } finally {
      setIsCheckingStatus(false);
    }
  };

  React.useEffect(() => {
    checkStatus();
  }, []);

  const handleInstall = async () => {
    if (!settings.pythonPath) {
      setInstallError(
        'Python path not configured. Set it in Settings > General first.',
      );
      return;
    }
    setIsInstalling(true);
    setInstallError(null);
    try {
      const result = await flowfileInstall();
      if (result.ok) {
        toast.success('Flowfile installed successfully');
        await checkStatus();
      } else {
        setInstallError(result.error ?? 'Installation failed');
      }
    } finally {
      setIsInstalling(false);
    }
  };

  const handlePortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSettingsChange('flowfilePort', e.target.value);
    const current = { ...settings, flowfilePort: e.target.value };
    updateSettings(current);
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
          {isInstalling
            ? 'Installing…'
            : installedVersion
              ? 'Upgrade Flowfile'
              : 'Install Flowfile'}
        </Button>
      </Box>

      <Divider />

      {/* Port config */}
      <Box>
        <Typography variant="subtitle1" fontWeight="medium" gutterBottom>
          UI Port
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The port Flowfile's core service runs on. Default is{' '}
          <code>63578</code>.
        </Typography>
        <TextField
          label="Port"
          value={port}
          onChange={handlePortChange}
          size="small"
          sx={{ width: 160 }}
          inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
        />
      </Box>
    </Box>
  );
};
