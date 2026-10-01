import React from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
} from '@mui/material';

type Props = {
  open: boolean;
  /** 'table' | 'view' | 'column' — used for the title only. */
  objectKind: string;
  currentName: string;
  /**
   * Shown under the input. Hosts use it to explain whether the rename runs
   * immediately or only generates a statement.
   */
  description?: string;
  onClose: () => void;
  onConfirm: (newName: string) => void;
};

export const RenameSchemaObjectDialog: React.FC<Props> = ({
  open,
  objectKind,
  currentName,
  description,
  onClose,
  onConfirm,
}) => {
  const [value, setValue] = React.useState(currentName);

  React.useEffect(() => {
    if (open) setValue(currentName);
  }, [open, currentName]);

  const trimmed = value.trim();
  const canConfirm = trimmed.length > 0 && trimmed !== currentName;

  const confirm = () => {
    if (canConfirm) onConfirm(trimmed);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      data-testid="schema-tree-rename-dialog"
    >
      <DialogTitle>Rename {objectKind}</DialogTitle>
      <DialogContent>
        {description && (
          <DialogContentText sx={{ mb: 1.5, fontSize: '0.85rem' }}>
            {description}
          </DialogContentText>
        )}
        <TextField
          autoFocus
          fullWidth
          size="small"
          label="New name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              confirm();
            }
          }}
          inputProps={{ 'data-testid': 'schema-tree-rename-input' }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={confirm}
          disabled={!canConfirm}
          data-testid="schema-tree-rename-confirm"
        >
          Rename
        </Button>
      </DialogActions>
    </Dialog>
  );
};
