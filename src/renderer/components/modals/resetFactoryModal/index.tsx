import React from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Box,
  Typography,
  Alert,
} from '@mui/material';
import { Warning, Backup, DeleteForever } from '@mui/icons-material';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
};

export const ResetFactoryModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
}) => {
  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      aria-labelledby="reset-factory-dialog-title"
      aria-describedby="reset-factory-dialog-description"
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle id="reset-factory-dialog-title">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Warning color="error" />
          <Typography variant="h6">Reset Factory Settings</Typography>
        </Box>
      </DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="body2" fontWeight="500">
            This action will permanently delete all your data and cannot be
            undone.
          </Typography>
        </Alert>

        <DialogContentText id="reset-factory-dialog-description" sx={{ mb: 2 }}>
          <Typography variant="body1" sx={{ mb: 1 }}>
            Before proceeding, please make sure you have backed up your projects
            to GitHub or your file system.
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            The following data will be permanently deleted:
          </Typography>

          <Box component="ul" sx={{ pl: 2, mb: 2 }}>
            <Typography component="li" variant="body2" color="text.secondary">
              All projects and their files
            </Typography>
            <Typography component="li" variant="body2" color="text.secondary">
              All database connections
            </Typography>
            <Typography component="li" variant="body2" color="text.secondary">
              All cloud storage connections
            </Typography>
            <Typography component="li" variant="body2" color="text.secondary">
              All saved queries
            </Typography>
            <Typography component="li" variant="body2" color="text.secondary">
              All application settings
            </Typography>
            <Typography component="li" variant="body2" color="text.secondary">
              All stored credentials (database passwords, API keys, etc.)
            </Typography>
          </Box>

          <Typography variant="body2" color="text.secondary">
            After reset, the application will automatically restart with factory
            default settings.
          </Typography>
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button
          onClick={onClose}
          color="primary"
          variant="outlined"
          disabled={isLoading}
          startIcon={<Backup />}
        >
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          color="error"
          variant="contained"
          disabled={isLoading}
          startIcon={<DeleteForever />}
          autoFocus
        >
          {isLoading ? 'Resetting...' : 'Reset All Data'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
