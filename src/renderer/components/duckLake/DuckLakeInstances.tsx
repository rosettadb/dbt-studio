import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Edit,
  Delete,
  // PlayArrow,
  // Stop,
  Circle,
  Storage,
  Refresh,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import moment from 'moment';
import {
  useDuckLakeInstances,
  // useConnectDuckLakeInstance,
  // useDisconnectDuckLakeInstance,
  useDeleteDuckLakeInstance,
} from '../../controllers/duckLake.controller';
import { ConfirmationModal } from '../modals/confirmationModal';

interface DuckLakeInstancesProps {
  onInstanceSelect?: (instanceId: string) => void;
}

export const DuckLakeInstances: React.FC<DuckLakeInstancesProps> = ({
  onInstanceSelect,
}) => {
  const navigate = useNavigate();
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    instanceId: string | null;
    instanceName: string | null;
  }>({
    isOpen: false,
    instanceId: null,
    instanceName: null,
  });

  // React Query hooks
  const {
    data: instances = [],
    isLoading,
    error,
    refetch,
  } = useDuckLakeInstances();
  // const connectMutation = useConnectDuckLakeInstance();
  // const disconnectMutation = useDisconnectDuckLakeInstance();
  const deleteMutation = useDeleteDuckLakeInstance();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'success';
      case 'error':
        return 'error';
      default:
        return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    let color = 'grey.500';
    if (status === 'active') {
      color = 'success.main';
    } else if (status === 'error') {
      color = 'error.main';
    }
    return <Circle sx={{ fontSize: 12, color }} />;
  };

  // const handleConnect = (instanceId: string) => {
  //   connectMutation.mutate(instanceId);
  // };

  // const handleDisconnect = (instanceId: string) => {
  //   disconnectMutation.mutate(instanceId);
  // };

  const handleDelete = (instanceId: string) => {
    const instance = instances.find((inst) => inst.id === instanceId);
    setDeleteConfirmation({
      isOpen: true,
      instanceId,
      instanceName: instance?.name || 'this instance',
    });
  };

  const handleConfirmDelete = () => {
    if (deleteConfirmation.instanceId) {
      deleteMutation.mutate(deleteConfirmation.instanceId);
    }
    setDeleteConfirmation({
      isOpen: false,
      instanceId: null,
      instanceName: null,
    });
  };

  const handleCancelDelete = () => {
    setDeleteConfirmation({
      isOpen: false,
      instanceId: null,
      instanceName: null,
    });
  };

  const handleEdit = (instanceId: string) => {
    navigate(`/app/duck-lake/instances/${instanceId}/edit`);
  };

  const handleInstanceClick = (instanceId: string) => {
    if (onInstanceSelect) {
      onInstanceSelect(instanceId);
    } else {
      navigate(`/app/duck-lake/instances/${instanceId}`);
    }
  };

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load DuckLake instances: {(error as Error).message}
        </Alert>
        <Button onClick={() => refetch()} startIcon={<Refresh />}>
          Retry
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 'bold' }}>
            DuckLake Instances
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage your DuckLake data lake instances
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <IconButton
            onClick={() => refetch()}
            disabled={isLoading}
            title="Refresh"
          >
            <Refresh />
          </IconButton>
        </Box>
      </Box>

      {/* Loading State */}
      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Empty State */}
      {!isLoading && instances.length === 0 && (
        <Card sx={{ textAlign: 'center', py: 4 }}>
          <CardContent>
            <Storage sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              No DuckLake Instances
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Create your first DuckLake instance using the &quot;New
              Instance&quot; button in the sidebar.
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* Instances Table */}
      {!isLoading && instances.length > 0 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Catalog Type</TableCell>
                <TableCell>Data Path</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Last Updated</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {instances.map((instance) => (
                <TableRow
                  key={instance.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => handleInstanceClick(instance.id)}
                >
                  <TableCell>
                    <Box>
                      <Typography
                        variant="subtitle2"
                        sx={{ fontWeight: 'bold' }}
                      >
                        {instance.name}
                      </Typography>
                      {instance.description && (
                        <Typography variant="caption" color="text.secondary">
                          {instance.description}
                        </Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {getStatusIcon(instance.status)}
                      <Chip
                        label={instance.status}
                        size="small"
                        color={getStatusColor(instance.status) as any}
                        variant="outlined"
                      />
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={instance.catalog.type.toUpperCase()}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{ fontFamily: 'monospace' }}
                    >
                      {instance.dataPath}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {moment(instance.createdAt).format('MMM D, YYYY')}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {moment(instance.createdAt).fromNow()}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {moment(instance.updatedAt).format('MMM D, YYYY')}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {moment(instance.updatedAt).fromNow()}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      {/* {instance.status === 'active' ? (
                        <IconButton
                          size="small"
                          onClick={() => handleDisconnect(instance.id)}
                          disabled={disconnectMutation.isLoading}
                          title="Disconnect"
                        >
                          <Stop />
                        </IconButton>
                      ) : (
                        <IconButton
                          size="small"
                          onClick={() => handleConnect(instance.id)}
                          disabled={connectMutation.isLoading}
                          title="Connect"
                        >
                          <PlayArrow />
                        </IconButton>
                      )} */}
                      <IconButton
                        size="small"
                        onClick={() => handleEdit(instance.id)}
                        title="Edit"
                      >
                        <Edit />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handleDelete(instance.id)}
                        disabled={deleteMutation.isLoading}
                        title="Delete"
                        color="error"
                      >
                        <Delete />
                      </IconButton>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteConfirmation.isOpen}
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        title="Delete DuckLake Instance"
        question={`Are you sure you want to delete "${deleteConfirmation.instanceName}"? This action cannot be undone.`}
      />
    </Box>
  );
};
