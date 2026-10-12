import React from 'react';
import { Box, CircularProgress } from '@mui/material';
import { SettingsStatus } from '../settings/SettingsLayout';

type Props = {
  isInstalling: boolean;
  isInstalled: boolean;
  version?: string;
};

// Top-right status of a setup card: "Not installed", "Installing" with a
// spinner, or the installed version.
export const SetupInstallStatus: React.FC<Props> = ({
  isInstalling,
  isInstalled,
  version,
}) => {
  if (isInstalling) {
    return (
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.75,
          fontSize: 12,
          color: 'primary.main',
          whiteSpace: 'nowrap',
        }}
      >
        <CircularProgress size={12} />
        Installing
      </Box>
    );
  }
  if (isInstalled) {
    return (
      <SettingsStatus tone="success">
        {version ? `v${version}` : 'Installed'}
      </SettingsStatus>
    );
  }
  return <SettingsStatus tone="neutral">Not installed</SettingsStatus>;
};
