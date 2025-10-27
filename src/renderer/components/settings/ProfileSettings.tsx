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
import { Login, Refresh, Logout } from '@mui/icons-material';
import { toast } from 'react-toastify';
import {
  useAuthToken,
  useAuthLogin,
  useAuthLogout,
} from '../../controllers/auth.controller';
import {
  useProfile,
  useRefreshProfile,
  useProfileSubscription,
} from '../../controllers/profile.controller';
import { ProfileCard } from '../profile/ProfileCard';

export const ProfileSettings: React.FC = () => {
  const { data: authToken, isLoading: tokenLoading } = useAuthToken();
  const {
    data: profile,
    isLoading: profileLoading,
    error: profileError,
  } = useProfile();
  const { mutate: login, isLoading: loginLoading } = useAuthLogin({
    onSuccess: () => {
      toast.success(
        'Login initiated! Please complete authentication in your browser.',
      );
    },
    onError: (error) => {
      toast.error(`Login failed: ${error.message || 'Unknown error'}`);
    },
  });
  const { mutate: refreshProfile, isLoading: refreshing } = useRefreshProfile();
  const { mutate: logout, isLoading: logoutLoading } = useAuthLogout({
    onSuccess: () => {
      toast.success('Logged out successfully');
    },
    onError: (error) => {
      toast.error(`Logout failed: ${error.message || 'Unknown error'}`);
    },
  });

  // Subscribe to profile events for real-time updates
  useProfileSubscription();

  const isLoading = tokenLoading || profileLoading || loginLoading;

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

  // User is not logged in
  if (!authToken) {
    return (
      <Box>
        <Typography variant="h6" gutterBottom>
          Cloud Dashboard Profile
        </Typography>
        <Typography variant="body2" color="textSecondary" paragraph>
          Connect to your Cloud Dashboard account to view and manage your
          profile information.
        </Typography>
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <Login sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Not Connected
            </Typography>
            <Typography variant="body2" color="textSecondary" paragraph>
              Sign in to your Cloud Dashboard account to access your profile.
            </Typography>
            <Button
              variant="contained"
              onClick={() => login()}
              disabled={loginLoading}
              startIcon={
                loginLoading ? <CircularProgress size={16} /> : <Login />
              }
            >
              {loginLoading ? 'Connecting...' : 'Connect to Cloud Dashboard'}
            </Button>
          </CardContent>
        </Card>
      </Box>
    );
  }

  // User is logged in but profile failed to load
  if (profileError && !profile) {
    return (
      <Box>
        <Typography variant="h6" gutterBottom>
          Cloud Dashboard Profile
        </Typography>
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load profile information. Please try refreshing or check
          your connection.
        </Alert>
        <Button
          variant="outlined"
          onClick={() => refreshProfile()}
          disabled={refreshing}
          startIcon={refreshing ? <CircularProgress size={16} /> : <Refresh />}
        >
          {refreshing ? 'Refreshing...' : 'Retry'}
        </Button>
      </Box>
    );
  }

  // User is logged in and profile loaded successfully
  return (
    <Box>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={2}
      >
        <Typography variant="h6">Cloud Dashboard Profile</Typography>
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
          <Button
            variant="outlined"
            size="small"
            color="error"
            onClick={() => logout()}
            disabled={logoutLoading}
            startIcon={
              logoutLoading ? <CircularProgress size={16} /> : <Logout />
            }
          >
            {logoutLoading ? 'Logging out...' : 'Logout'}
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
  );
};
