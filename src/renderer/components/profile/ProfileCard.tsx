import React from 'react';
import {
  Card,
  CardContent,
  Avatar,
  Typography,
  Chip,
  Box,
  CircularProgress,
} from '@mui/material';
import { Person, AdminPanelSettings } from '@mui/icons-material';
import { useProfile } from '../../controllers/profile.controller';

export const ProfileCard: React.FC = () => {
  const { data: profile, isLoading, error } = useProfile();

  if (isLoading) {
    return (
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="center" p={2}>
            <CircularProgress size={24} />
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (error || !profile) {
    return (
      <Card>
        <CardContent>
          <Typography color="textSecondary">
            Profile information unavailable
          </Typography>
        </CardContent>
      </Card>
    );
  }

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase();
    }
    return email[0].toUpperCase();
  };

  return (
    <Card>
      <CardContent>
        <Box display="flex" alignItems="center" gap={2}>
          <Avatar>{getInitials(profile.name, profile.email)}</Avatar>
          <Box flex={1}>
            <Typography variant="h6">{profile.name || 'User'}</Typography>
            <Typography variant="body2" color="textSecondary">
              {profile.email}
            </Typography>
            <Box mt={1}>
              <Chip
                icon={
                  profile.role === 'ADMIN' ? <AdminPanelSettings /> : <Person />
                }
                label={profile.role}
                size="small"
                color={profile.role === 'ADMIN' ? 'primary' : 'default'}
              />
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};
