import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
} from '@mui/material';
import { toast } from 'react-toastify';
import { Project, ConnectionModel } from '../../../../types/backend';

interface AddConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project | null;
  connections: ConnectionModel[];
  onSuccess?: () => void;
  onUpdateProject: (project: Project) => void;
}

export const AddConnectionModal: React.FC<AddConnectionModalProps> = ({
  isOpen,
  onClose,
  project,
  connections,
  onSuccess,
  onUpdateProject,
}) => {
  const [selectedConnectionId, setSelectedConnectionId] =
    React.useState<string>('');
  const [isLoading, setIsLoading] = React.useState(false);

  const handleSubmit = () => {
    if (!project || !selectedConnectionId) {
      toast.error('Please select a connection');
      return;
    }

    setIsLoading(true);
    onUpdateProject({
      ...project,
      connectionId: selectedConnectionId,
    });

    toast.success(`Connection added to project ${project.name} successfully!`);
    onSuccess?.();
    onClose();
    setIsLoading(false);
  };

  const handleClose = () => {
    setSelectedConnectionId('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Connection to Project</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Select a database connection for the project:{' '}
            <strong>{project?.name}</strong>
          </Typography>
        </Box>

        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel id="connection-select-label">Connection</InputLabel>
          <Select
            labelId="connection-select-label"
            value={selectedConnectionId}
            label="Connection"
            onChange={(e) => setSelectedConnectionId(e.target.value)}
          >
            {connections.map((connection) => (
              <MenuItem key={connection.id} value={connection.id}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Typography variant="body2">
                    {connection.connection.name}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ ml: 1, color: 'text.secondary' }}
                  >
                    ({connection.connection.type})
                  </Typography>
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!selectedConnectionId || isLoading}
        >
          {isLoading ? 'Adding...' : 'Add Connection'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
