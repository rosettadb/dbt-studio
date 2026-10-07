import React from 'react';
import { Avatar, Chip, Box, CircularProgress } from '@mui/material';
import { Person, AdminPanelSettings } from '@mui/icons-material';
import { useProfile } from '../../controllers/profile.controller';
import { SettingsRow } from '../settings/SettingsLayout';

export const ProfileCard: React.FC = () => {
  const { data: profile, isLoading, error } = useProfile();

  if (isLoading) {
    return (
      <SettingsRow label="Loading profile...">
        <CircularProgress size={18} />
      </SettingsRow>
    );
  }

  if (error || !profile) {
    return <SettingsRow label="Profile information unavailable" />;
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
    <SettingsRow
      label={
        <Box display="flex" alignItems="center" gap={1}>
          <Avatar sx={{ width: 24, height: 24, fontSize: 12 }}>
            {getInitials(profile.name, profile.email)}
          </Avatar>
          {profile.name || 'User'}
        </Box>
      }
      description={profile.email}
    >
      <Chip
        icon={profile.role === 'ADMIN' ? <AdminPanelSettings /> : <Person />}
        label={profile.role}
        size="small"
        color={profile.role === 'ADMIN' ? 'primary' : 'default'}
      />
    </SettingsRow>
  );
};
