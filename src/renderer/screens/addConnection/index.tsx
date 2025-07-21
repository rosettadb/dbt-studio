import React from 'react';
import { styled } from '@mui/material/styles';
import { Typography, Box, Button } from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import { ConnectionCard } from '../../components/connectionCards';
import connectionIcons from '../../../../assets/connectionIcons';
import { Connections } from '../../components';
import { SupportedConnectionTypes } from '../../../types/backend';
import { AppLayout } from '../../layouts';

const ConnectionContainer = styled(Box)`
  padding: 1rem 2rem 2rem;
  max-width: 1200px;
  margin: 0 auto;
  height: 100%;
`;

const ConnectionCardsContainer = styled(Box)`
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 32px;
  padding: 12px 0 36px;
  max-width: 1000px;
  margin: 0 auto;
`;

const BackButtonContainer = styled(Box)`
  display: flex;
  justify-content: center;
  margin-top: 2rem;
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
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [selectedItem, setSelectedItem] = React.useState<ItemType>();

  const handleBack = () => {
    navigate(-1); // Go back to previous page
  };

  const renderComponent = () => {
    switch (selectedItem?.id) {
      case 'postgres': {
        return (
          <Connections.Postgres
            onCancel={() => setSelectedItem(undefined)}
            projectId={projectId}
          />
        );
      }
      case 'snowflake': {
        return (
          <Connections.Snowflake
            onCancel={() => setSelectedItem(undefined)}
            projectId={projectId}
          />
        );
      }
      case 'bigquery': {
        return (
          <Connections.BigQuery
            onCancel={() => setSelectedItem(undefined)}
            projectId={projectId}
          />
        );
      }
      case 'redshift': {
        return (
          <Connections.Redshift
            onCancel={() => setSelectedItem(undefined)}
            projectId={projectId}
          />
        );
      }
      case 'databricks': {
        return (
          <Connections.Databricks
            onCancel={() => setSelectedItem(undefined)}
            projectId={projectId}
          />
        );
      }
      case 'duckdb': {
        return (
          <Connections.DuckDB
            onCancel={() => setSelectedItem(undefined)}
            projectId={projectId}
          />
        );
      }
      default: {
        return (
          <Connections.Postgres
            onCancel={() => setSelectedItem(undefined)}
            projectId={projectId}
          />
        );
      }
    }
  };

  return (
    <AppLayout>
      {selectedItem ? (
        <ConnectionContainer>{renderComponent()}</ConnectionContainer>
      ) : (
        <ConnectionContainer>
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

            {!projectId && (
              <BackButtonContainer>
                <Button variant="outlined" onClick={handleBack} size="large">
                  Back
                </Button>
              </BackButtonContainer>
            )}
          </Box>
        </ConnectionContainer>
      )}
    </AppLayout>
  );
};

export default AddConnection;
