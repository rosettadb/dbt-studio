import React from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Box,
} from '@mui/material';
import { Close, ErrorOutline } from '@mui/icons-material';

export type GitUiError = {
  title: string;
  message: string;
  operation: string;
  repoPath?: string;
  details?: string;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
};

type Props = {
  isOpen: boolean;
  error: GitUiError | null;
  onClose: () => void;
};

export const GitErrorModal: React.FC<Props> = ({ isOpen, error, onClose }) => {
  const handleClose = (_event: object, reason?: string) => {
    if (reason === 'backdropClick') {
      return;
    }
    onClose();
  };

  if (!error) {
    return null;
  }

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      aria-labelledby="git-error-dialog-title"
      aria-describedby="git-error-dialog-description"
      disableEscapeKeyDown
    >
      <DialogTitle id="git-error-dialog-title">
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
          }}
        >
          <Box sx={{ fontWeight: 600 }}>{error.title}</Box>
          <IconButton
            aria-label="close"
            onClick={onClose}
            sx={{
              color: 'text.secondary',
              '&:hover': {
                backgroundColor: 'action.hover',
              },
            }}
          >
            <Close fontSize="small" />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent>
        <DialogContentText id="git-error-dialog-description">
          {error.message}
        </DialogContentText>
        {error.details ? (
          <Box
            sx={{
              mt: 1.5,
              p: 1,
              borderRadius: 1,
              backgroundColor: 'action.hover',
              fontFamily: 'monospace',
              fontSize: '12px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {error.details}
          </Box>
        ) : null}
      </DialogContent>
      <DialogActions>
        {error.onPrimaryAction && error.primaryActionLabel ? (
          <Button
            onClick={error.onPrimaryAction}
            variant="contained"
            startIcon={<ErrorOutline fontSize="small" />}
            autoFocus
          >
            {error.primaryActionLabel}
          </Button>
        ) : null}
        <Button
          onClick={onClose}
          variant="outlined"
          startIcon={<Close fontSize="small" />}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};
