import React from 'react';
import { Tooltip } from '@mui/material';
import { Cloud, Computer } from '@mui/icons-material';
import { toast } from 'react-toastify';
import {
  StatusBarContainer,
  StatusBarSection,
  StatusBarItem,
  StatusBarClickableItem,
  StatusBarDivider,
  EnvSwitch,
} from './styles';
import {
  useGetSelectedProject,
  useGetSettings,
  useUpdateSettings,
  useProfile,
  useApiKey,
} from '../../controllers';

export const StatusBar: React.FC = () => {
  const { data: project } = useGetSelectedProject();
  const { data: settings } = useGetSettings();
  const { mutate: updateSettings } = useUpdateSettings();
  const { data: profile } = useProfile();
  const { data: apiKey } = useApiKey();

  const isCloud = settings?.env === 'cloud';

  const handleEnvToggle = () => {
    const newEnv = isCloud ? 'local' : 'cloud';
    updateSettings({
      ...settings!,
      env: newEnv,
    });
    toast.info(
      `Switched to ${newEnv === 'cloud' ? 'Cloud' : 'Local'} environment`,
    );
  };

  return (
    <StatusBarContainer>
      {/* Left section */}
      <StatusBarSection>
        {project?.name && (
          <>
            <StatusBarItem>{project.name}</StatusBarItem>
            <StatusBarDivider />
          </>
        )}
        {apiKey && <StatusBarItem>Connected</StatusBarItem>}
      </StatusBarSection>

      {/* Right section */}
      <StatusBarSection>
        {profile && (
          <>
            <Tooltip
              title={`Switch to ${isCloud ? 'Local' : 'Cloud'} environment`}
              placement="top"
              arrow
            >
              <StatusBarClickableItem onClick={handleEnvToggle}>
                {isCloud ? (
                  <Cloud sx={{ fontSize: 13 }} />
                ) : (
                  <Computer sx={{ fontSize: 13 }} />
                )}
                <EnvSwitch
                  checked={isCloud}
                  onChange={handleEnvToggle}
                  size="small"
                  inputProps={{ 'aria-label': 'Environment switcher' }}
                />
                {isCloud ? 'Cloud' : 'Local'}
              </StatusBarClickableItem>
            </Tooltip>
            <StatusBarDivider />
          </>
        )}
        {profile && (
          <StatusBarItem>
            {profile.email || profile.name || 'Signed in'}
          </StatusBarItem>
        )}
      </StatusBarSection>
    </StatusBarContainer>
  );
};
