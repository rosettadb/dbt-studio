import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Typography } from '@mui/material';
import { connectionFormFor } from '../../../connections/registry.renderer';
import { useGetConnectionById } from '../../controllers';
import {
  ConnectionModel,
  SupportedConnectionTypes,
} from '../../../types/backend';
import { AppLayout } from '../../layouts';
import { ConnectionsSidebar } from '../../components/sidebarConnections';
import { Container } from './styles';

const EditConnection: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: connection, isLoading, error } = useGetConnectionById(id || '');

  const handleCancel = () => {
    navigate('/app/connections');
  };

  const renderComponent = (
    connectionType: SupportedConnectionTypes,
    conn: ConnectionModel,
    connId: string,
  ) => {
    const Form = connectionFormFor(connectionType);
    return <Form key={connId} onCancel={handleCancel} connection={conn} />;
  };

  if (isLoading) {
    return (
      <AppLayout
        sidebarContent={<ConnectionsSidebar />}
        panelTitle="Connections"
      >
        <Container>
          <Typography variant="h6">Loading connection...</Typography>
        </Container>
      </AppLayout>
    );
  }

  // Handle case where connection ID is missing from URL
  if (!id) {
    return (
      <AppLayout
        sidebarContent={<ConnectionsSidebar />}
        panelTitle="Connections"
      >
        <Container>
          <Typography variant="h6">
            Connection ID is required. Please provide a valid connection ID.
          </Typography>
        </Container>
      </AppLayout>
    );
  }

  // Handle case where connection is not found or error occurred
  if (error || !connection) {
    return (
      <AppLayout
        sidebarContent={<ConnectionsSidebar />}
        panelTitle="Connections"
      >
        <Container>
          <Typography variant="h6">
            Connection not found. Please check the connection ID and try again.
          </Typography>
        </Container>
      </AppLayout>
    );
  }

  return (
    <AppLayout sidebarContent={<ConnectionsSidebar />} panelTitle="Connections">
      <Container>
        {renderComponent(connection.connection.type, connection, id)}
      </Container>
    </AppLayout>
  );
};

export default EditConnection;
