import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  CircularProgress,
  Box,
  TextField,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import { toast } from 'react-toastify';
import { useDeleteBucket } from '../../controllers/cloudExplorer.controller';
import type {
  CloudProvider,
  CloudStorageConfig,
} from '../../../types/frontend';

interface DeleteBucketDialogProps {
  open: boolean;
  onClose: () => void;
  provider: CloudProvider;
  config: CloudStorageConfig;
  bucketName: string;
  onSuccess?: () => void;
}

const DeleteBucketDialog: React.FC<DeleteBucketDialogProps> = ({
  open,
  onClose,
  provider,
  config,
  bucketName,
  onSuccess,
}) => {
  const [confirmInput, setConfirmInput] = useState('');
  const isConfirmed = confirmInput === bucketName;

  const deleteMutation = useDeleteBucket({
    onSuccess: () => {
      toast.success(`Bucket "${bucketName}" deleted.`);
      onSuccess?.();
      onClose();
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Failed to delete bucket.';
      toast.error(message);
    },
  });

  const handleConfirm = () => {
    deleteMutation.mutate({ provider, config, bucketName });
  };

  const handleClose = () => {
    if (deleteMutation.isLoading) return;
    setConfirmInput('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <WarningAmberIcon color="warning" />
        Delete Bucket
      </DialogTitle>
      <DialogContent>
        <Typography gutterBottom>
          Are you sure you want to delete bucket{' '}
          <Box component="strong">{bucketName}</Box>?
        </Typography>
        <Box
          sx={{
            mt: 2,
            p: 1.5,
            borderRadius: 1,
            bgcolor: 'error.main',
            color: 'error.contrastText',
            opacity: 0.9,
          }}
        >
          <Typography variant="body2" fontWeight="bold" gutterBottom>
            This action is permanent and cannot be undone.
          </Typography>
          <Typography variant="body2">
            All objects inside this bucket will be permanently deleted. Make
            sure you have a backup of any data you need before proceeding.
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ mt: 2, mb: 0.5 }}>
          To confirm, type <Box component="strong">{bucketName}</Box> below:
        </Typography>
        <TextField
          fullWidth
          size="small"
          value={confirmInput}
          onChange={(e) => setConfirmInput(e.target.value)}
          placeholder={bucketName}
          disabled={deleteMutation.isLoading}
          error={confirmInput.length > 0 && !isConfirmed}
          autoComplete="off"
          onPaste={(e) => e.preventDefault()}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={deleteMutation.isLoading}>
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          color="error"
          disabled={!isConfirmed || deleteMutation.isLoading}
          startIcon={
            deleteMutation.isLoading ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <DeleteForeverIcon />
            )
          }
        >
          Delete Permanently
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DeleteBucketDialog;
