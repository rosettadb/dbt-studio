import React from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
import { toast } from 'react-toastify';
import { useCreateBoard } from '../../controllers';

export const slugPreview = (name: string) =>
  name
    .replace(/\\/g, '/')
    .split('/')
    .map((s) =>
      s
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    )
    .filter(Boolean)
    .join('/');

export const validateBoardName = (
  name: string,
  existing: string[],
): string | null => {
  const slug = slugPreview(name);
  if (!slug) return 'Enter a board name';
  if (name.includes('..')) return 'Name must stay inside charts/';
  if (existing.some((b) => b.toLowerCase() === `charts/${slug}.yml`))
    return 'A board with this name already exists';
  return null;
};

type Props = {
  open: boolean;
  projectId: string;
  existingBoards: string[];
  onClose: () => void;
  /** Absolute path of the created board. */
  onCreated: (path: string) => void;
};

export const NewBoardDialog: React.FC<Props> = ({
  open,
  projectId,
  existingBoards,
  onClose,
  onCreated,
}) => {
  const [name, setName] = React.useState('');
  const { mutateAsync: createBoard, isLoading } = useCreateBoard();
  const error = name ? validateBoardName(name, existingBoards) : null;
  const slug = slugPreview(name);

  const submit = async () => {
    if (validateBoardName(name, existingBoards)) return;
    try {
      const res = await createBoard({ projectId, name });
      setName('');
      onCreated(res.path);
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not create board');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>New board</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          margin="dense"
          label="Board name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={Boolean(error)}
          helperText={error ?? undefined}
          inputProps={{ 'data-testid': 'new-board-name' }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        {slug && !error && (
          <Typography variant="caption" color="text.secondary">
            Will create charts/{slug}.yml
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!name || Boolean(error) || isLoading}
          onClick={submit}
        >
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
};
