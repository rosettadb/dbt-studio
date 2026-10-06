import React from 'react';
import { Box, CircularProgress, Alert } from '@mui/material';
import { CloudOff, PersonOutline } from '@mui/icons-material';
import {
  useApiKey,
  useProfile,
  useRefreshProfile,
  useProfileSubscription,
} from '../../controllers';
import { ProfileCard } from '../profile';
import { CloudSettings } from './CloudSettings';
import {
  SettingsRefreshButton,
  SettingsRow,
  SettingsSection,
  SettingsSectionBody,
  SettingsStack,
} from './SettingsLayout';

export const ProfileSettings: React.FC = () => {
  const { data: apiKey, isLoading: apiKeyLoading } = useApiKey();
  const { isLoading: profileLoading, error: profileError } = useProfile();
  const { mutate: refreshProfile, isLoading: refreshing } = useRefreshProfile();

  // Subscribe to profile events for real-time updates
  useProfileSubscription();

  const isLoading = apiKeyLoading || profileLoading;

  if (isLoading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="200px"
      >
        <CircularProgress />
      </Box>
    );
  }

  // Always show cloud settings, regardless of connection status
  return (
    <SettingsStack>
      <CloudSettings />

      <SettingsSection
        title="Profile Information"
        icon={<PersonOutline />}
        description={
          apiKey
            ? 'Your profile information from the Cloud Dashboard.'
            : undefined
        }
        action={
          apiKey && (
            <SettingsRefreshButton
              title="Refresh profile"
              onClick={() => refreshProfile()}
              loading={refreshing}
            />
          )
        }
      >
        {apiKey ? (
          <ProfileCard />
        ) : (
          <SettingsRow
            label={
              <Box display="flex" alignItems="center" gap={1}>
                <CloudOff fontSize="small" color="disabled" />
                Not Connected
              </Box>
            }
            description="Connect to your Cloud Dashboard account above to view your profile information."
          />
        )}
        {apiKey && profileError && (
          <SettingsSectionBody>
            <Alert severity="warning">
              Profile data may be outdated. Last refresh failed.
            </Alert>
          </SettingsSectionBody>
        )}
      </SettingsSection>
    </SettingsStack>
  );
};
