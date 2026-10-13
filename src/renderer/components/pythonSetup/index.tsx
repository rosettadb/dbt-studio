import React from 'react';
import { Box, Typography, Button, LinearProgress } from '@mui/material';
import { Check, CodeOutlined } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { SettingsType } from '../../../types/backend';
import { useInstallPython } from '../../controllers';
import {
  SettingsSection,
  SettingsSectionBody,
} from '../settings/SettingsLayout';
import { SetupInstallStatus } from '../setupInstallStatus';

type Props = {
  settings: SettingsType;
  isAnyInstallRunning: boolean;
  onInstallingChange: (isInstalling: boolean) => void;
};

export const PythonSetup: React.FC<Props> = ({
  settings,
  isAnyInstallRunning,
  onInstallingChange,
}) => {
  const installPython = useInstallPython({
    onSuccess: (result) => {
      if (result.success) {
        toast.info('Python installation completed');
      } else {
        toast.error(`Python installation failed: ${result.error}`);
      }
      onInstallingChange(false);
    },
    onError: (error) => {
      toast.error(`Python installation failed: ${error.message}`);
      onInstallingChange(false);
    },
  });

  const isInstalled = Boolean(settings.pythonPath);

  return (
    <SettingsSection
      title="Python"
      icon={<CodeOutlined />}
      action={
        <SetupInstallStatus
          isInstalling={installPython.isLoading}
          isInstalled={isInstalled}
          version={settings.pythonVersion}
        />
      }
    >
      <SettingsSectionBody>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Embedded Python interpreter for dbt Core v1, separate from your system
          Python.
        </Typography>
        {installPython.isLoading ? (
          <Box>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Installing Python...
            </Typography>
            <LinearProgress />
          </Box>
        ) : (
          <Button
            variant="contained"
            onClick={() => {
              onInstallingChange(true);
              installPython.mutate();
            }}
            disabled={isInstalled || isAnyInstallRunning}
            data-testid="setup-install-python-btn"
            startIcon={isInstalled ? <Check /> : null}
          >
            {isInstalled ? 'Installed' : 'Install Python'}
          </Button>
        )}
      </SettingsSectionBody>
    </SettingsSection>
  );
};
