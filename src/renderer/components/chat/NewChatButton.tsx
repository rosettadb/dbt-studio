import React from 'react';
import { IconButton, Tooltip, CircularProgress } from '@mui/material';
import { Add } from '@mui/icons-material';

interface NewChatButtonProps {
  onCreate: () => void;
  disabled?: boolean;
  loading?: boolean;
}

export const NewChatButton: React.FC<NewChatButtonProps> = ({
  onCreate,
  disabled = false,
  loading = false,
}) => {
  return (
    <Tooltip title="New chat">
      <IconButton
        size="small"
        onClick={onCreate}
        disabled={disabled || loading}
        sx={{
          color: disabled ? 'text.disabled' : 'text.secondary',
          '&:hover': {
            color: 'primary.main',
          },
        }}
      >
        {loading ? <CircularProgress size={16} /> : <Add fontSize="small" />}
      </IconButton>
    </Tooltip>
  );
};
