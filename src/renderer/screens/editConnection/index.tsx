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
  ) => {
    switch (connectionType) {
      case 'postgres': {
        return (
          <Connections.Postgres onCancel={handleCancel} connection={conn} />
        );
      }
      case 'snowflake': {
        return (
          <Connections.Snowflake onCancel={handleCancel} connection={conn} />
        );
      }
      case 'bigquery': {
        return (
          <Connections.BigQuery onCancel={handleCancel} connection={conn} />
        );
      }
      case 'redshift': {
        return (
          <Connections.Redshift onCancel={handleCancel} connection={conn} />
        );
      }
      case 'databricks': {
        return (
          <Connections.Databricks onCancel={handleCancel} connection={conn} />
        );
      }
      case 'duckdb': {
        return <Connections.DuckDB onCancel={handleCancel} connection={conn} />;
      }
      default: {
        return (
          <Connections.Postgres onCancel={handleCancel} connection={conn} />
        );
      }
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <Container>
          <Typography variant="h6">Loading connection...</Typography>
        </Container>
      </AppLayout>
    );
  }

  // Handle case where connection ID is missing from URL
  if (!id) {
    return (
      <AppLayout>
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
      <AppLayout>
        <Container>
          <Typography variant="h6">
            Connection not found. Please check the connection ID and try again.
          </Typography>
        </Container>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Container>
        {renderComponent(connection.connection.type, connection)}
      </Container>
    </AppLayout>
  );
};

export default EditConnection;
