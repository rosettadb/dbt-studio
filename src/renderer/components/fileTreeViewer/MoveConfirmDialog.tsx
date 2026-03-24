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
  const [fileName, setFileName] = useState<string>('');
  const [targetFolder, setTargetFolder] = useState<string>('');

  useEffect(() => {
    const fetchNames = async () => {
      if (sourcePath) {
        try {
          const name = await settingsServices.getBasename(sourcePath);
          setFileName(name);
        } catch (error) {
          // Fallback to the path itself if service fails
          setFileName(sourcePath);
        }
      }

      if (targetPath) {
        try {
          const folder = await settingsServices.getBasename(targetPath);
          setTargetFolder(folder);
        } catch (error) {
          // Fallback to the path itself if service fails
          setTargetFolder(targetPath);
        }
      }
    };

    fetchNames();
  }, [sourcePath, targetPath]);

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
