import React from 'react';
import { Box, Typography, Button, LinearProgress } from '@mui/material';
import { Check, TerminalOutlined } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { SettingsType } from '../../../types/backend';
import {
  useCheckRunnerVersions,
  useInstallRunnerVersion,
} from '../../controllers';
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

export const RunnerSetup: React.FC<Props> = ({
  settings,
  isAnyInstallRunning,
  onInstallingChange,
}) => {
  const [latestVersion, setLatestVersion] = React.useState<string | null>(null);

  const checkVersions = useCheckRunnerVersions({
    onSuccess: (data) => {
      setLatestVersion(data.latestStable || null);
    },
    onError: (error) => {
      toast.error(`Failed to check runner versions: ${error.message}`);
    },
  });

  const installRunner = useInstallRunnerVersion({
    onSuccess: (result) => {
      if (result.success) {
        toast.info(`Local runner ${result.version} installation completed`);
        result.warnings?.forEach((warning) => toast.warning(warning));
      } else {
        toast.error(`Local runner installation failed: ${result.error}`);
      }
      onInstallingChange(false);
    },
    onError: (error) => {
      toast.error(`Local runner installation failed: ${error.message}`);
      onInstallingChange(false);
    },
  });

  React.useEffect(() => {
    checkVersions.mutate();
  }, []);

  const isInstalled = Boolean(settings.runnerPath);

  let installButton: React.ReactNode;
  if (isInstalled) {
    installButton = (
      <Button
        variant="contained"
        disabled
        data-testid="setup-install-runner-btn"
        startIcon={<Check />}
      >
        Installed
      </Button>
    );
  } else {
    installButton = (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Button
          variant="contained"
          onClick={() => {
            if (!latestVersion) return;
            onInstallingChange(true);
            installRunner.mutate(latestVersion);
          }}
          disabled={
            isAnyInstallRunning || checkVersions.isLoading || !latestVersion
          }
          data-testid="setup-install-runner-btn"
        >
          {checkVersions.isLoading
            ? 'Checking versions...'
            : 'Install Local Runner'}
        </Button>
        {latestVersion && (
          <Typography variant="body2" color="text.secondary">
            Latest version: {latestVersion}
          </Typography>
        )}
      </Box>
    );
  }

  return (
    <SettingsSection
      title="Local runner"
      icon={<TerminalOutlined />}
      action={
        <SetupInstallStatus
          isInstalling={installRunner.isLoading}
          isInstalled={isInstalled}
          version={settings.runnerVersion}
        />
      }
    >
      <SettingsSectionBody>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          The local runner executes rosetta pipelines on this machine, the same
          way the cloud runner does on the server.
        </Typography>
        {installRunner.isLoading ? (
          <Box>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Installing local runner {latestVersion}...
            </Typography>
            <LinearProgress />
          </Box>
        ) : (
          installButton
        )}
      </SettingsSectionBody>
    </SettingsSection>
  );
};
