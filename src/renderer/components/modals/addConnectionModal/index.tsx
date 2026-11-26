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
  ListSubheader,
} from '@mui/material';
import { Storage as DatabaseIcon } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { Project, ConnectionModel } from '../../../../types/backend';
import { projectTypeOf } from '../../../../shared/projectTypes';
import {
  connectionIcon,
  connectionLabel,
} from '../../../../connections/registry.renderer';
import { useDuckLakeInstances } from '../../../controllers';
import { duckLakeInstanceConnectionId } from '../../../../shared/duckLakeInstanceIds';

interface AddConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project | null;
  connections: ConnectionModel[];
  onSuccess?: () => void;
  onUpdateProject: (project: Project) => void;
}

interface ConnectionOption {
  id: string;
  name: string;
  type: string;
  icon?: string;
}

const ConnectionOptionContent: React.FC<{ option: ConnectionOption }> = ({
  option,
}) => {
  const typeLabel = connectionLabel(option.type) ?? option.type;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
      {option.icon ? (
        <Box
          component="img"
          src={option.icon}
          alt={typeLabel}
          sx={{
            width: 20,
            height: 20,
            objectFit: 'contain',
            flexShrink: 0,
            mr: 1,
          }}
        />
      ) : (
        <DatabaseIcon sx={{ fontSize: 20, mr: 1, color: 'text.secondary' }} />
      )}
      <Typography variant="body2" noWrap>
        {option.name}
      </Typography>
      <Typography
        variant="caption"
        sx={{ ml: 1, color: 'text.secondary', flexShrink: 0 }}
      >
        ({typeLabel})
      </Typography>
    </Box>
  );
};

export const AddConnectionModal: React.FC<AddConnectionModalProps> = ({
  isOpen,
  onClose,
  project,
  connections,
  onSuccess,
  onUpdateProject,
}) => {
  const { data: duckLakeInstances = [] } = useDuckLakeInstances();
  const offersInstances =
    !!project && projectTypeOf(project).capabilities.datalakeAsInstance;
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
    setSelectedConnectionId('');
    onClose();
    setIsLoading(false);
  };

  const handleClose = () => {
    setSelectedConnectionId('');
    onClose();
  };

  const savedOptions: ConnectionOption[] = connections
    .filter((connection) =>
      projectTypeOf(project).acceptsConnection(connection.connection.type),
    )
    .map((connection) => ({
      id: connection.id,
      name: connection.connection.name,
      type: connection.connection.type,
      icon: connectionIcon(connection.connection.type),
    }));
  const instanceOptions: ConnectionOption[] = offersInstances
    ? duckLakeInstances.map((instance) => ({
        id: duckLakeInstanceConnectionId(instance.id),
        name: instance.name,
        type: 'ducklake',
        icon: connectionIcon('ducklake'),
      }))
    : [];
  const findOption = (id: unknown) =>
    [...savedOptions, ...instanceOptions].find((option) => option.id === id);

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
            sx={{
              '& .MuiSelect-select': { display: 'flex', alignItems: 'center' },
            }}
            renderValue={(value) => {
              const option = findOption(value);
              return option ? <ConnectionOptionContent option={option} /> : '';
            }}
          >
            {savedOptions.map((option) => (
              <MenuItem key={option.id} value={option.id}>
                <ConnectionOptionContent option={option} />
              </MenuItem>
            ))}
            {/* Project types linked to a DuckLake instance itself (Analytics)
                also list the instances, as the SQL Editor does (plan 95) */}
            {instanceOptions.length > 0 && (
              <ListSubheader sx={{ lineHeight: '32px' }}>
                DuckLake Instances
              </ListSubheader>
            )}
            {instanceOptions.map((option) => (
              <MenuItem key={option.id} value={option.id}>
                <ConnectionOptionContent option={option} />
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
