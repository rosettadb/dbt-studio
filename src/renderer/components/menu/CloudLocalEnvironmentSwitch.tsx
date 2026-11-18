import React from 'react';
import { Box, Tooltip, useTheme } from '@mui/material';
import { Cloud, Computer } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useGetSettings, useUpdateSettings } from '../../controllers';
import {
  EnvironmentSwitchContainer,
  EnvironmentSwitch,
  SwitchIcon,
} from './styles';

// The Cloud / Local environment switch. It sits in the top bar, and in the
// Dashboard header on Home, where the top bar is hidden.
export const CloudLocalEnvironmentSwitch: React.FC = () => {
  const theme = useTheme();
  const { data: settings } = useGetSettings();
  const { mutate: updateSettings } = useUpdateSettings();

  return (
    <Box display="flex" gap={0.5}>
      <Tooltip
        title={`Switch to ${settings?.env === 'cloud' ? 'Local' : 'Cloud'} Environment`}
      >
        <EnvironmentSwitchContainer>
          <EnvironmentSwitch
            checked={settings?.env === 'cloud'}
            onChange={(event) => {
              const newEnv = event.target.checked ? 'cloud' : 'local';
              updateSettings({
                ...settings!,
                env: newEnv,
              });
              toast.info(
                `Switched to ${newEnv === 'cloud' ? 'Cloud' : 'Local'} environment`,
              );
            }}
            inputProps={{ 'aria-label': 'Environment switcher' }}
          />
          <SwitchIcon
            className={settings?.env === 'cloud' ? 'checked' : 'unchecked'}
          >
            {settings?.env === 'cloud' ? (
              <Cloud
                sx={{
                  fontSize: 12,
                  color: theme.palette.primary.contrastText,
                }}
              />
            ) : (
              <Computer
                sx={{
                  fontSize: 12,
                  color: theme.palette.primary.contrastText,
                }}
              />
            )}
          </SwitchIcon>
        </EnvironmentSwitchContainer>
      </Tooltip>
      <span
        style={{
          fontSize: '12px',
          color: theme.palette.text.secondary,
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          height: '100%',
        }}
      >
        {settings?.env === 'cloud' ? 'Cloud' : 'Local'}
      </span>
    </Box>
  );
};
