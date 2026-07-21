import React from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  TextField,
  Box,
} from '@mui/material';
import { Close, Check } from '@mui/icons-material';

type Props = {
  isOpen: boolean;
  isLoading?: boolean;
  onClose: () => void;
  onSubmit: (passphrase: string) => void;
};

export const SshPassphraseModal: React.FC<Props> = ({
  isOpen,
  isLoading = false,
  onClose,
  onSubmit,
}) => {
  const [passphrase, setPassphrase] = React.useState('');

  React.useEffect(() => {
    if (isOpen) {
      setPassphrase('');
    }
  }, [isOpen]);

  const handleSubmit = () => {
    onSubmit(passphrase);
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      aria-labelledby="ssh-passphrase-dialog-title"
    >
      <DialogTitle id="ssh-passphrase-dialog-title">
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          SSH Key Passphrase
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
        <DialogContentText sx={{ mb: 2 }}>
          The remote requires authentication. Enter your SSH key passphrase to
          continue.
        </DialogContentText>
        <TextField
          autoFocus
          variant="outlined"
          type="password"
          label="SSH Key Passphrase"
          placeholder="Leave empty if key has no passphrase"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          fullWidth
          disabled={isLoading}
        />
      </DialogContent>
      <DialogActions>
        <Button
          onClick={onClose}
          color="secondary"
          variant="outlined"
          disabled={isLoading}
          startIcon={<Close fontSize="small" />}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          color="primary"
          variant="contained"
          disabled={isLoading}
          startIcon={<Check fontSize="small" />}
        >
          {isLoading ? 'Pushing...' : 'Continue'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
