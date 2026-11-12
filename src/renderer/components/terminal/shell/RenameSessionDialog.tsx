import React from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';
import type { PtySessionInfo } from '../../../../types/pty';
import { shellSessions } from './shellSessions';

type Props = {
  /** Session being renamed; null keeps the dialog closed. */
  session: PtySessionInfo | null;
  onClose: () => void;
};

export const RenameSessionDialog: React.FC<Props> = ({ session, onClose }) => {
  const [title, setTitle] = React.useState('');

  React.useEffect(() => {
    if (session) setTitle(session.customTitle ? session.title : '');
  }, [session]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (session) {
      // An empty name hands the label back to the running program's name.
      shellSessions.rename(session.id, title).catch(() => undefined);
    }
    onClose();
  };

  return (
    <Dialog open={session !== null} onClose={onClose} maxWidth="xs" fullWidth>
      <form onSubmit={submit}>
        <DialogTitle sx={{ fontSize: 15 }}>Rename terminal</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            margin="dense"
            value={title}
            placeholder={session?.title}
            helperText="Leave empty to use the running program's name."
            inputProps={{ maxLength: 80, 'aria-label': 'Terminal name' }}
            onChange={(event) => setTitle(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} size="small">
            Cancel
          </Button>
          <Button type="submit" variant="contained" size="small">
            Rename
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
