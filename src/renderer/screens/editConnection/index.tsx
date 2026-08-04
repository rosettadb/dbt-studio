import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Typography } from '@mui/material';
import { Connections } from '../../components';
import { useGetConnectionById } from '../../controllers';
import {
  ConnectionModel,
  SupportedConnectionTypes,
} from '../../../types/backend';
import { AppLayout } from '../../layouts';
import { ConnectionsSidebar } from '../../components/sidebarConnections';
import { Container } from './styles';
import { getConnectionDisplayName } from '../../../shared/connections/connectionCapabilities';

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
    switch (connectionType) {
      case 'postgres': {
        return (
          <Connections.Postgres
            key={connId}
            onCancel={handleCancel}
            connection={conn}
          />
        );
      }
      case 'snowflake': {
        return (
          <Connections.Snowflake
            key={connId}
            onCancel={handleCancel}
            connection={conn}
          />
        );
      }
      case 'bigquery': {
        return (
          <Connections.BigQuery
            key={connId}
            onCancel={handleCancel}
            connection={conn}
          />
        );
      }
      case 'redshift': {
        return (
          <Connections.Redshift
            key={connId}
            onCancel={handleCancel}
            connection={conn}
          />
        );
      }
      case 'databricks': {
        return (
          <Connections.Databricks
            key={connId}
            onCancel={handleCancel}
            connection={conn}
          />
        );
      }
      case 'duckdb': {
        return (
          <Connections.DuckDB
            key={connId}
            onCancel={handleCancel}
            connection={conn}
          />
        );
      }
      case 'kinetica': {
        return (
          <Connections.Kinetica
            key={connId}
            onCancel={handleCancel}
            connection={conn}
          />
        );
      }
      case 'fabricspark': {
        return (
          <Connections.FabricSpark
            key={connId}
            onCancel={handleCancel}
            connection={conn}
          />
        );
      }
      case 'mysql':
      case 'oracle':
      case 'db2':
      case 'mssql':
      case 'googlecloud':
      case 'ducklake': {
        return (
          <Typography variant="h6">
            {getConnectionDisplayName(connectionType)} editing is not available
            yet.
          </Typography>
        );
      }
      default: {
        return (
          <Typography variant="h6">
            Unsupported connection type. Return to the connection list and
            select a supported connection.
          </Typography>
        );
      }
    }
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
