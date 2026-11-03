import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import { ReactComponent as ProvidersIcon } from '../../assets/icons/lucide/bot.svg';

type AIProviderSetupNoticeProps = {
  state: 'no-providers' | 'no-active-provider';
  onOpenSettings: () => void;
};

const COPY: Record<
  AIProviderSetupNoticeProps['state'],
  { title: string; description: string }
> = {
  'no-providers': {
    title: 'No AI providers configured',
    description:
      'Add an AI provider in settings to start chatting with the assistant.',
  },
  'no-active-provider': {
    title: 'No active AI provider',
    description:
      'Pick a provider from the selector below, or activate one in settings.',
  },
};

export const AIProviderSetupNotice: React.FC<AIProviderSetupNoticeProps> = ({
  state,
  onOpenSettings,
}) => {
  const { title, description } = COPY[state];
  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        textAlign: 'center',
        px: 3,
      }}
    >
      <Typography variant="body2" fontWeight={600}>
        {title}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {description}
      </Typography>
      <Button
        variant="outlined"
        size="small"
        startIcon={<ProvidersIcon width={14} height={14} />}
        onClick={onOpenSettings}
        sx={{ mt: 0.5 }}
      >
        Open AI Provider Settings
      </Button>
    </Box>
  );
};
