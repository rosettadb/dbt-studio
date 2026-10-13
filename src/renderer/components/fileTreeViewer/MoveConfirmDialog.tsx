import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
} from '@mui/material';
import { path } from '../../lib/path';

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
  // Fall back to the path itself when it has no basename (e.g. a drive root).
  const fileName = sourcePath ? path.basename(sourcePath) || sourcePath : '';
  const targetFolder = targetPath
    ? path.basename(targetPath) || targetPath
    : '';

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Move or Copy</DialogTitle>
      <DialogContent>
        <Typography>
          What would you like to do with <strong>{fileName}</strong> to{' '}
          <strong>{targetFolder}</strong>?
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
