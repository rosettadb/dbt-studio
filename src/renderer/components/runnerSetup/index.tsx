import React from 'react';
import {
  Box,
  Typography,
  Button,
  Alert,
  CircularProgress,
} from '@mui/material';
import { toast } from 'react-toastify';
import { SettingsType } from '../../../types/backend';
import {
  useCheckRunnerVersions,
  useInstallRunnerVersion,
} from '../../controllers';

type Props = {
  settings: SettingsType;
  onInstallComplete: (runnerPath: string) => void;
};

export const RunnerSetup: React.FC<Props> = ({
  settings,
  onInstallComplete,
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
        onInstallComplete(result.path);
      } else {
        toast.error(`Local runner installation failed: ${result.error}`);
      }
    },
    onError: (error) => {
      toast.error(`Local runner installation failed: ${error.message}`);
    },
  });

  React.useEffect(() => {
    checkVersions.mutate();
  }, []);

  const isInstalled = Boolean(settings.runnerPath);
  let installButtonLabel = isInstalled
    ? 'Reinstall Local Runner'
    : 'Install Local Runner';
  if (installRunner.isLoading) installButtonLabel = 'Installing...';

  return (
    <Box>
      <Typography variant="body1">
        The local runner executes rosetta pipelines on this machine, the same
        way the cloud runner does on the server.
      </Typography>

      {isInstalled ? (
        <Alert severity="success" sx={{ mt: 2, mb: 2 }}>
          Local runner (version {settings.runnerVersion || 'Unknown'}) is
          already installed at: {settings.runnerPath}
        </Alert>
      ) : (
        <Alert severity="info" sx={{ mt: 2, mb: 2 }}>
          The local runner is not installed yet. Click Install to set it up now.
        </Alert>
      )}

      {latestVersion && !installRunner.isLoading && (
        <Typography variant="body2" sx={{ mb: 1 }}>
          Latest version: {latestVersion}
        </Typography>
      )}

      <Box sx={{ mt: 2, mb: 3 }}>
        <Button
          variant="contained"
          onClick={() => latestVersion && installRunner.mutate(latestVersion)}
          disabled={
            installRunner.isLoading || checkVersions.isLoading || !latestVersion
          }
          data-testid="setup-install-runner-btn"
          startIcon={
            installRunner.isLoading || checkVersions.isLoading ? (
              <CircularProgress size={16} />
            ) : null
          }
        >
          {checkVersions.isLoading
            ? 'Checking versions...'
            : installButtonLabel}
        </Button>
      </Box>
    </Box>
  );
};
