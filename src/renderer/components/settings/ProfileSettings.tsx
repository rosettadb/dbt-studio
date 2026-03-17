import React from 'react';
import {
  Box,
  Button,
  Typography,
  Card,
  CardContent,
  CircularProgress,
  Alert,
} from '@mui/material';
import { Refresh, CloudOff } from '@mui/icons-material';
import {
  useApiKey,
  useProfile,
  useRefreshProfile,
  useProfileSubscription,
} from '../../controllers';
import { ProfileCard } from '../profile';
import { CloudSettings } from './CloudSettings';

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
    <Box maxWidth={800} width="100%">
      <CloudSettings />

      {!apiKey && (
        <Box mt={4}>
          <Typography variant="h6" gutterBottom>
            Profile Information
          </Typography>
          <Card sx={{ maxWidth: '100%' }}>
            <CardContent sx={{ textAlign: 'center', py: 3 }}>
              <CloudOff sx={{ fontSize: 40, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                Not Connected
              </Typography>
              <Typography variant="body2" color="textSecondary" paragraph>
                Connect to your Cloud Dashboard account above to view your
                profile information.
              </Typography>
            </CardContent>
          </Card>
        </Box>
      )}

      {apiKey && (
        <Box mt={4}>
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            mb={2}
          >
            <Typography variant="h6">Profile Information</Typography>
            <Box display="flex" gap={1}>
              <Button
                variant="outlined"
                size="small"
                onClick={() => refreshProfile()}
                disabled={refreshing}
                startIcon={
                  refreshing ? <CircularProgress size={16} /> : <Refresh />
                }
              >
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </Button>
            </Box>
          </Box>
          <Typography variant="body2" color="textSecondary" paragraph>
            Your profile information from the Cloud Dashboard.
          </Typography>

          <ProfileCard />

          {profileError && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Profile data may be outdated. Last refresh failed.
            </Alert>
          )}
        </Box>
      )}
    </Box>
  );
};
