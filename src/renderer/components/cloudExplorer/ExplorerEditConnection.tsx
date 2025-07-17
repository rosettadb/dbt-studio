import React from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { Box, CircularProgress, Alert } from '@mui/material';
import { ConnectionForm } from './ConnectionForm';
import { useConnection } from '../../controllers/cloudExplorer.controller';

export const ExplorerEditConnection: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const connectionQuery = useConnection(id || '');

  if (!id) {
    return <Navigate to="/app/cloud-explorer/connections" replace />;
  }

  if (connectionQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (connectionQuery.isError) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">
          Failed to load connection: {String(connectionQuery.error)}
        </Alert>
      </Box>
    );
  }

  if (!connectionQuery.data) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">Connection not found</Alert>
      </Box>
    );
  }

  return (
    <ConnectionForm
      initialValues={connectionQuery.data}
      isEditing
      connectionId={id}
    />
  );
};
