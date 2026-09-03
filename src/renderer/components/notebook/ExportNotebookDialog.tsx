/**
 * Export Notebook Dialog
 * Confirms a notebook (or bulk) export and offers to include full
 * connection details (including credentials) in the exported JSON.
 */
import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  FormControlLabel,
  Checkbox,
  Alert,
  Tooltip,
} from '@mui/material';

interface ExportNotebookDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (includeConnection: boolean) => void;
  /** e.g. "notebook \"My Notebook\"" or "3 notebooks" */
  subject: string;
  connectionName?: string;
  /** Disable the checkbox for connection types that can't be exported this way (e.g. DuckLake instances) */
  connectionExportDisabled?: boolean;
}

export const ExportNotebookDialog: React.FC<ExportNotebookDialogProps> = ({
  open,
  onClose,
  onConfirm,
  subject,
  connectionName,
  connectionExportDisabled,
}) => {
  const [includeConnection, setIncludeConnection] = useState(false);

  const handleClose = () => {
    setIncludeConnection(false);
    onClose();
  };

  const handleConfirm = () => {
    onConfirm(includeConnection);
    setIncludeConnection(false);
  };

  const checkbox = (
    <FormControlLabel
      control={
        <Checkbox
          checked={includeConnection}
          disabled={connectionExportDisabled}
          onChange={(e) => setIncludeConnection(e.target.checked)}
        />
      }
      label={`Include connection details${connectionName ? ` for "${connectionName}"` : ''}`}
    />
  );

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Export {subject}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 1 }}>
          Export {subject} as a JSON file.
        </DialogContentText>
        {connectionExportDisabled ? (
          <Tooltip title="Not available for this connection type">
            <span>{checkbox}</span>
          </Tooltip>
        ) : (
          checkbox
        )}
        {includeConnection && !connectionExportDisabled && (
          <Alert severity="warning" sx={{ mt: 1 }}>
            The connection, including its credentials, will be written to the
            file in plain text. Only share this file with people you trust.
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button onClick={handleConfirm} variant="contained">
          Export
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ExportNotebookDialog;
