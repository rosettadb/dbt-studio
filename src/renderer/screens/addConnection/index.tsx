import React from 'react';
import { styled } from '@mui/material/styles';
import {
  Typography,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Divider,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ConnectionCard } from '../../components/connectionCards';
import connectionIcons from '../../../../assets/connectionIcons';
import { Connections } from '../../components';
import {
  useConfigureConnection,
  useGetConnections,
  useGetSelectedProject,
} from '../../controllers';
import { SupportedConnectionTypes } from '../../../types/backend';
import { AppLayout } from '../../layouts';

const ConnectionContainer = styled(Box)`
  padding: 1rem 2rem 2rem;
  max-width: 1200px;
  margin: 0 auto;
  height: 100%;
`;

const HeaderContainer = styled(Box)`
  margin-bottom: 2rem;
  text-align: left;
`;

const ExistingConnectionsContainer = styled(Box)`
  margin-bottom: 2rem;
  padding: 1rem;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background-color: #f9f9f9;
`;

const ConnectionCardsContainer = styled(Box)`
  display: flex;
  justify-content: start;
  flex-wrap: wrap;
  gap: 32px;
  padding: 12px 0 36px;
  max-width: 1000px;
`;

const ActionButtonContainer = styled(Box)`
  display: flex;
  gap: 1rem;
  margin-top: 1rem;
`;

type ItemType = {
  id: SupportedConnectionTypes;
  name: string;
  img: keyof typeof connectionIcons.images;
  disabled: boolean;
};

const baseItems: ItemType[] = [
  {
    id: 'postgres',
    name: 'PostgreSQL',
    img: 'postgres',
    disabled: false,
  },
  {
    id: 'snowflake',
    name: 'Snowflake',
    img: 'snowflake',
    disabled: false,
  },
  {
    id: 'bigquery',
    name: 'BigQuery',
    img: 'bigquery',
    disabled: false,
  },
  {
    id: 'redshift',
    name: 'Redshift',
    img: 'redshift',
    disabled: false,
  },
  {
    id: 'databricks',
    name: 'Databricks',
    img: 'databricks',
    disabled: false,
  },
  {
    id: 'duckdb',
    name: 'DuckDB',
    img: 'duckdb',
    disabled: false,
  },
];

const AddConnection: React.FC = () => {
  const navigate = useNavigate();
  const { data: project } = useGetSelectedProject();
  const [selectedItem, setSelectedItem] = React.useState<ItemType>();
  const [selectedConnectionId, setSelectedConnectionId] =
    React.useState<string>('');
  const { data: connections = [], isLoading: isLoadingConnections } =
    useGetConnections();

  const { mutate: configureConnection, isLoading: isConfiguring } =
    useConfigureConnection({
      onSuccess: () => {
        toast.success('Connection configured successfully!');
        navigate(`/app/project-details`);
      },
      onError: (error) => {
        toast.error(`Configuration failed: ${error}`);
      },
    });

  const handleUseExistingConnection = () => {
    if (!selectedConnectionId || !project?.id) {
      toast.error('Please select a connection');
      return;
    }

    configureConnection({
      projectId: project.id,
      connectionId: selectedConnectionId,
    });
  };

  const renderComponent = () => {
    switch (selectedItem?.id) {
      case 'postgres': {
        return (
          <Connections.Postgres onCancel={() => setSelectedItem(undefined)} />
        );
      }
      case 'snowflake': {
        return (
          <Connections.Snowflake onCancel={() => setSelectedItem(undefined)} />
        );
      }
      case 'bigquery': {
        return (
          <Connections.BigQuery onCancel={() => setSelectedItem(undefined)} />
        );
      }
      case 'redshift': {
        return (
          <Connections.Redshift onCancel={() => setSelectedItem(undefined)} />
        );
      }
      case 'databricks': {
        return (
          <Connections.Databricks onCancel={() => setSelectedItem(undefined)} />
        );
      }
      case 'duckdb': {
        return (
          <Connections.DuckDB onCancel={() => setSelectedItem(undefined)} />
        );
      }
      default: {
        return (
          <Connections.Postgres onCancel={() => setSelectedItem(undefined)} />
        );
      }
    }
  };

  React.useEffect(() => {
    if (project?.rosettaConnection) {
      navigate('/app/project-details');
    }
  }, [project]);

  return (
    <AppLayout>
      {selectedItem ? (
        <ConnectionContainer>{renderComponent()}</ConnectionContainer>
      ) : (
        <ConnectionContainer>
          <HeaderContainer>
            <Typography variant="h5" component="h5">
              Connection
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Please select an existing connection or create a new one
            </Typography>
          </HeaderContainer>

          {/* Existing Connections Section */}
          {connections.length > 0 && (
            <>
              <ExistingConnectionsContainer>
                <Typography variant="h6" component="h6" gutterBottom>
                  Use Existing Connection
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Select from your previously configured connections
                </Typography>

                <FormControl fullWidth margin="normal">
                  <InputLabel id="connection-select-label">
                    Select Connection
                  </InputLabel>
                  <Select
                    labelId="connection-select-label"
                    value={selectedConnectionId}
                    label="Select Connection"
                    onChange={(e) => setSelectedConnectionId(e.target.value)}
                    disabled={isLoadingConnections}
                  >
                    {connections.map((connection) => (
                      <MenuItem key={connection.id} value={connection.id}>
                        {connection.connection.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <ActionButtonContainer>
                  <Button
                    variant="contained"
                    onClick={handleUseExistingConnection}
                    disabled={!selectedConnectionId || isConfiguring}
                  >
                    {isConfiguring
                      ? 'Configuring...'
                      : 'Use Selected Connection'}
                  </Button>
                </ActionButtonContainer>
              </ExistingConnectionsContainer>

              <Divider sx={{ margin: '2rem 0' }}>
                <Typography variant="body2" color="text.secondary">
                  OR
                </Typography>
              </Divider>
            </>
          )}

          {/* New Connection Section */}
          <Box>
            <Typography variant="h6" component="h6" gutterBottom>
              Create New Connection
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Select a database type to create a new connection
            </Typography>

            <ConnectionCardsContainer>
              {baseItems.map((item, index) => (
                <ConnectionCard
                  itemDetails={item}
                  onClick={() => setSelectedItem(item)}
                  key={index}
                />
              ))}
            </ConnectionCardsContainer>
          </Box>
        </ConnectionContainer>
      )}
    </AppLayout>
  );
};

export default AddConnection;
