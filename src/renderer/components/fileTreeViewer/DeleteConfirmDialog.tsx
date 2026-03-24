import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
} from '@mui/material';
import { settingsServices } from '../../services';

interface DeleteConfirmDialogProps {
  open: boolean;
  path: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteConfirmDialog: React.FC<DeleteConfirmDialogProps> = ({
  open,
  path,
  onConfirm,
  onCancel,
}) => {
  const [fileName, setFileName] = useState<string>('');

  useEffect(() => {
    const fetchFileName = async () => {
      if (path) {
        try {
          const name = await settingsServices.getBasename(path);
          setFileName(name);
        } catch (error) {
          // Fallback to the path itself if service fails
          setFileName(path);
        }
      }
    };

    fetchFileName();
  }, [path]);

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Confirm Delete</DialogTitle>
      <DialogContent>
        <Typography>
          Are you sure you want to delete <strong>{fileName}</strong>? This
          action cannot be undone.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} color="inherit">
          Cancel
        </Button>
        <Button onClick={onConfirm} variant="contained" color="error">
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
};
