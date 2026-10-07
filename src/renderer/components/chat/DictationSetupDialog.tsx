import React from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import type { SpeechStatus } from '../../../types/speech';

interface DictationSetupDialogProps {
  open: boolean;
  status: SpeechStatus | undefined;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * One-time confirmation before dictation installs its offline dependencies:
 * the vosk package into the studio's Python environment and the speech model.
 */
export const DictationSetupDialog: React.FC<DictationSetupDialogProps> = ({
  open,
  status,
  onConfirm,
  onClose,
}) => (
  <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
    <DialogTitle>Set up dictation</DialogTitle>
    <DialogContent>
      <DialogContentText component="div">
        Dictation runs fully offline on this computer. Setting it up is a
        one-time step:
        <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
          {!status?.voskInstalled && (
            <li>
              install the open-source <code>vosk</code> speech recognizer into
              Studio&apos;s Python environment
            </li>
          )}
          {!status?.modelInstalled && (
            <li>
              download the {status?.modelLabel ?? 'English'} speech model (~
              {status?.modelSizeMb ?? 40} MB) from {status?.modelSource}
            </li>
          )}
        </ul>
        No audio ever leaves your machine. You can remove the model later from
        Settings → AI.
      </DialogContentText>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} size="small">
        Cancel
      </Button>
      <Button onClick={onConfirm} variant="contained" size="small">
        Set up
      </Button>
    </DialogActions>
  </Dialog>
);
