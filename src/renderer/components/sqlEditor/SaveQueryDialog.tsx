import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
} from '@mui/material';

interface SaveQueryDialogProps {
  open: boolean;
  initialName?: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}

export const SaveQueryDialog: React.FC<SaveQueryDialogProps> = ({
  open,
  initialName = 'Query #1',
  onClose,
  onSave,
}) => {
  const [name, setName] = useState(initialName);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setIsSaving(false);
    }
  }, [open, initialName]);

  const handleSave = async () => {
    if (name.trim() && !isSaving) {
      setIsSaving(true);
      try {
        await onSave(name.trim());
        onClose();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to save query:', error);
      } finally {
        setIsSaving(false);
      }
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontSize: '0.9rem', fontWeight: 600, pb: 1 }}>
        Saved Query Name
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 1 }}>
          <TextField
            autoFocus
            fullWidth
            size="small"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSave();
              }
            }}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          onClick={onClose}
          color="inherit"
          size="small"
          variant="contained"
          sx={{
            bgcolor: 'action.hover',
            color: 'text.primary',
            boxShadow: 'none',
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          color="primary"
          size="small"
          variant="contained"
          disabled={!name.trim() || isSaving}
        >
          {isSaving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
