import React, { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  LinearProgress,
  Box,
  CircularProgress,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { toast } from 'react-toastify';
import { useDeleteObject } from '../../controllers/cloudExplorer.controller';
import { cloudExplorerService } from '../../services';
import type {
  CloudProvider,
  CloudStorageConfig,
} from '../../../types/frontend';

interface DeleteConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  provider: CloudProvider;
  config: CloudStorageConfig;
  bucketName: string;
  objectKey: string;
  isPrefix: boolean;
  onSuccess?: () => void;
}

const DeleteConfirmDialog: React.FC<DeleteConfirmDialogProps> = ({
  open,
  onClose,
  provider,
  config,
  bucketName,
  objectKey,
  isPrefix,
  onSuccess,
}) => {
  const [deleteProgress, setDeleteProgress] = useState<number | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const deleteMutation = useDeleteObject({
    onSuccess: (data) => {
      setDeleteProgress(null);
      const label = isPrefix ? `${data.deletedCount} objects` : 'Object';
      toast.success(`${label} deleted successfully.`);
      onSuccess?.();
      onClose();
    },
    onError: (error: unknown) => {
      setDeleteProgress(null);
      const message = error instanceof Error ? error.message : 'Delete failed.';
      toast.error(message);
    },
  });

  useEffect(() => {
    if (!open) return undefined;

    // Subscribe to progress events (reused for batch delete progress)
    const unsubscribe = cloudExplorerService.onUploadProgress((event) => {
      setDeleteProgress(event.percentage);
    });
    unsubscribeRef.current = unsubscribe;

    return () => {
      unsubscribeRef.current?.();
    };
  }, [open]);

  const handleConfirm = () => {
    deleteMutation.mutate({
      provider,
      config,
      bucketName,
      objectKey,
      isPrefix,
    });
  };

  const handleClose = () => {
    if (deleteMutation.isLoading) return;
    setDeleteProgress(null);
    onClose();
  };

  // Display name: show just the last segment for readability
  const displayName =
    objectKey.replace(/\/$/, '').split('/').pop() || objectKey;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <WarningAmberIcon color="warning" />
        Delete {isPrefix ? 'Folder' : 'File'}
      </DialogTitle>
      <DialogContent>
        <Typography gutterBottom>
          Are you sure you want to delete <strong>{displayName}</strong>
          {isPrefix ? ' and all its contents' : ''}?
        </Typography>
        <Typography variant="body2" color="error" sx={{ mt: 1 }}>
          This action is permanent and cannot be undone.
        </Typography>
        {deleteMutation.isLoading && isPrefix && (
          <Box sx={{ mt: 2 }}>
            {deleteProgress !== null ? (
              <LinearProgress
                variant="determinate"
                value={deleteProgress}
                aria-label={`Delete progress: ${deleteProgress}%`}
              />
            ) : (
              <LinearProgress aria-label="Deleting objects..." />
            )}
            <Typography variant="caption" sx={{ mt: 0.5, display: 'block' }}>
              Deleting objects...
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={deleteMutation.isLoading}>
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          color="error"
          disabled={deleteMutation.isLoading}
          startIcon={
            deleteMutation.isLoading ? (
              <CircularProgress size={16} color="inherit" />
            ) : undefined
          }
        >
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DeleteConfirmDialog;
