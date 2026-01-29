import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  IconButton,
} from '@mui/material';
import {
  Warning,
  Close,
  Save as SaveIcon,
  DoNotDisturb,
} from '@mui/icons-material';

interface UnsavedChangesDialogProps {
  open: boolean;
  fileName: string;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export const UnsavedChangesDialog: React.FC<UnsavedChangesDialogProps> = ({
  open,
  fileName,
  onSave,
  onDiscard,
  onCancel,
}) => {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Warning color="warning" />
            <Typography variant="h6">Unsaved Changes</Typography>
          </Box>
          <IconButton
            aria-label="Close"
            onClick={onCancel}
            size="small"
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
        <Typography>
          Do you want to save changes to <strong>{fileName}</strong>?
        </Typography>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          onClick={onDiscard}
          variant="outlined"
          startIcon={<DoNotDisturb />}
        >
          Don&apos;t Save
        </Button>

        <Button
          onClick={onSave}
          variant="contained"
          autoFocus
          startIcon={<SaveIcon />}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};
