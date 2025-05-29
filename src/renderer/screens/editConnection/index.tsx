import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography } from '@mui/material';
import { Connections } from '../../components';
import { useGetSelectedProject } from '../../controllers';
import { SupportedConnectionTypes } from '../../../types/backend';
import { AppLayout } from '../../layouts';
import { Container } from './styles';

const EditConnection: React.FC = () => {
  const navigate = useNavigate();
  const { data: project } = useGetSelectedProject();

  const handleCancel = () => {
    navigate('/app/project-details');
  };

  const renderComponent = (connectionType: SupportedConnectionTypes) => {
    switch (connectionType) {
      case 'postgres': {
        return <Connections.Postgres onCancel={handleCancel} />;
      }
      case 'snowflake': {
        return <Connections.Snowflake onCancel={handleCancel} />;
      }
      case 'bigquery': {
        return <Connections.BigQuery onCancel={handleCancel} />;
      }
      case 'redshift': {
        return <Connections.Redshift onCancel={handleCancel} />;
      }
      default: {
        return <Connections.Postgres onCancel={handleCancel} />;
      }
    }
  };

  // Handle case where project or dbtConnection is undefined
  if (!project || !project.dbtConnection) {
    return (
      <AppLayout>
        <Container>
          <Typography variant="h6" color="error">
            No connection configuration found. Please set up a connection first.
          </Typography>
        </Container>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Container>{renderComponent(project.dbtConnection.type)}</Container>
    </AppLayout>
  );
};

export default EditConnection;
