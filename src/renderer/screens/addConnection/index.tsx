import React from 'react';
import { styled } from '@mui/material/styles';
import { Typography, Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { ConnectionCard } from '../../components/connectionCards';
import connectionIcons from '../../../../assets/connectionIcons';
import { Connections } from '../../components';
import { useGetSelectedProject } from '../../controllers';
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

const ConnectionCardsContainer = styled(Box)`
  display: flex;
  justify-content: start;
  flex-wrap: wrap;
  gap: 16px;
  padding: 12px 0 36px;
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
    disabled: true,
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
              Please select the database to connect
            </Typography>
          </HeaderContainer>
          <ConnectionCardsContainer>
            {baseItems.map((item, index) => (
              <ConnectionCard
                itemDetails={item}
                onClick={() => setSelectedItem(item)}
                key={index}
              />
            ))}
          </ConnectionCardsContainer>
        </ConnectionContainer>
      )}
    </AppLayout>
  );
};

export default AddConnection;
