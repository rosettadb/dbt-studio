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
import { Close, Delete, Clear } from '@mui/icons-material';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  connectionName?: string;
};

export const RemoveConnectionModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onConfirm,
  connectionName,
}) => {
  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      aria-labelledby="remove-connection-dialog-title"
      aria-describedby="remove-connection-dialog-description"
    >
      <DialogTitle id="remove-connection-dialog-title">
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          Remove Connection
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
        <DialogContentText id="remove-connection-dialog-description">
          {`Are you sure you want to remove the connection${
            connectionName ? ` "${connectionName}"` : ''
          } from this project?`}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={onClose}
          variant="outlined"
          startIcon={<Clear />}
          sx={{
            color: 'text.secondary',
            borderColor: 'divider',
            '&:hover': {
              borderColor: 'text.secondary',
              backgroundColor: 'action.hover',
            },
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          color="error"
          variant="contained"
          autoFocus
          startIcon={<Delete />}
        >
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
};
