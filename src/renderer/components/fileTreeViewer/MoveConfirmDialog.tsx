import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
} from '@mui/material';

interface MoveConfirmDialogProps {
  open: boolean;
  sourcePath: string;
  targetPath: string;
  onMove: () => void;
  onCopy: () => void;
  onCancel: () => void;
}

export const MoveConfirmDialog: React.FC<MoveConfirmDialogProps> = ({
  open,
  sourcePath,
  targetPath,
  onMove,
  onCopy,
  onCancel,
}) => {
  const getFileName = (path: string) => {
    return path.split('/').pop() || path;
  };

  const getTargetFolder = (path: string) => {
    return path.split('/').pop() || path;
  };

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Move or Copy</DialogTitle>
      <DialogContent>
        <Typography>
          What would you like to do with{' '}
          <strong>{getFileName(sourcePath)}</strong> to{' '}
          <strong>{getTargetFolder(targetPath)}</strong>?
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} color="inherit">
          Cancel
        </Button>
        <Button onClick={onCopy} variant="outlined" color="primary">
          Copy
        </Button>
        <Button onClick={onMove} variant="contained" color="primary">
          Move
        </Button>
      </DialogActions>
    </Dialog>
  );
};
