import React from 'react';
import { styled } from '@mui/material/styles';
import {
  Typography,
  Box,
  Button,
  FormControlLabel,
  Switch,
  Stack,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ConnectionCard } from '../../components/connectionCards';
import {
  connectionFormFor,
  connectionLabel,
  creatableConnections,
} from '../../../connections/registry.renderer';
import {
  canUseAsDbtConnection,
  SupportedConnectionTypes,
} from '../../../types/backend';
import { AppLayout } from '../../layouts';
import { ConnectionsSidebar } from '../../components/sidebarConnections';

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
  justify-content: flex-end;
  margin-bottom: 1rem;
`;

type ItemType = {
  id: SupportedConnectionTypes;
  name: string;
  icon: string;
  disabled: boolean;
  dbtCompatible?: boolean;
};

const baseItems: ItemType[] = creatableConnections().map((ui) => ({
  id: ui.type,
  name: connectionLabel(ui.type) ?? ui.type,
  icon: ui.icon,
  disabled: false,
}));

const AddConnection: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const duplicateData = location.state?.duplicateFrom;
  const suggestedName = location.state?.suggestedName;
  const [selectedItem, setSelectedItem] = React.useState<ItemType>();
  const [onlyDbtCompatible, setOnlyDbtCompatible] = React.useState(false);

  const visibleItems = React.useMemo(
    () =>
      baseItems.filter(
        (item) =>
          (!projectId || canUseAsDbtConnection(item.id)) &&
          (!onlyDbtCompatible || canUseAsDbtConnection(item.id)),
      ),
    [projectId, onlyDbtCompatible],
  );

  // Auto-select connection type if duplicating
  React.useEffect(() => {
    if (duplicateData) {
      const item = baseItems.find(
        (item_) => item_.id === duplicateData.connection.type,
      );
      if (item) setSelectedItem(item);
    }
  }, [duplicateData]);

  const handleBack = () => {
    navigate(-1);
  };

  const renderComponent = () => {
    const Form = connectionFormFor(selectedItem?.id);
    return (
      <Form
        onCancel={() => setSelectedItem(undefined)}
        projectId={projectId}
        duplicateFrom={duplicateData}
        suggestedName={suggestedName}
      />
    );
  };

  return (
    <AppLayout sidebarContent={<ConnectionsSidebar />} panelTitle="Connections">
      {selectedItem ? (
        <ConnectionContainer>{renderComponent()}</ConnectionContainer>
      ) : (
        <ConnectionContainer>
          <Box>
            {!projectId && (
              <BackButtonContainer>
                <Button
                  variant="outlined"
                  onClick={handleBack}
                  startIcon={<ArrowBackIcon />}
                >
                  Back
                </Button>
              </BackButtonContainer>
            )}

            <Typography variant="h6" component="h6" gutterBottom>
              Create New Connection
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Select a database type to create a new connection
            </Typography>

            <Stack
              direction="row"
              alignItems="center"
              justifyContent="flex-end"
              sx={{ mb: 1 }}
            >
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={onlyDbtCompatible}
                    onChange={(e) => setOnlyDbtCompatible(e.target.checked)}
                  />
                }
                label="Only show dbt-compatible connections"
              />
            </Stack>

            <ConnectionCardsContainer>
              {visibleItems.map((item, index) => (
                <ConnectionCard
                  itemDetails={{
                    ...item,
                    dbtCompatible: canUseAsDbtConnection(item.id),
                  }}
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
