import React from 'react';
import {
  Box,
  Typography,
  Grid,
  Button,
  Alert,
  CircularProgress,
  Chip,
  Paper,
  TextField,
  Tabs,
  Tab,
} from '@mui/material';
import { Add, Info, Refresh, Storage } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  useGetAIProviders,
  useGetActiveAIProvider,
} from '../../controllers/aiProviders.controller';
import type { AIProvider } from '../../controllers/aiProviders.controller';
import { CreateProviderDialog, ProviderCard } from '../ai';
import { useGetSettingsWithDatabaseInfo } from '../../controllers';
import { AISettingsTab } from './AISettingsTab';
import { MCPServersTab } from './MCPServersTab';
import { SkillsTab } from './SkillsTab';
import { MemoryTab } from './MemoryTab';

const TABS = [
  'Providers',
  'Settings',
  'MCP Servers',
  'Skills',
  'Memory',
] as const;
type TabLabel = (typeof TABS)[number];

export const AIProvidersSettings: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tabParam = searchParams.get('tab') as TabLabel | null;
  const activeTab: TabLabel =
    tabParam && (TABS as readonly string[]).includes(tabParam)
      ? tabParam
      : 'Providers';

  const setActiveTab = (tab: TabLabel) =>
    navigate(`/app/settings/ai-providers?tab=${encodeURIComponent(tab)}`, {
      replace: true,
    });

  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [selectedProvider, setSelectedProvider] =
    React.useState<AIProvider | null>(null);

  const { data: settingsWithDbInfo } = useGetSettingsWithDatabaseInfo();

  const {
    data: providers = [],
    isLoading: isLoadingProviders,
    error: providersError,
    refetch: refetchProviders,
  } = useGetAIProviders({
    onError: (error) => {
      toast.error(`Failed to load AI providers: ${error?.message}`);
    },
  });

  const {
    data: activeProvider,
    isLoading: isLoadingActiveProvider,
    refetch: refetchActiveProvider,
  } = useGetActiveAIProvider({
    onError: (error) => {
      toast.error(`Failed to load active AI provider: ${error?.message}`);
    },
  });

  const handleRefreshAll = () => {
    refetchProviders();
    refetchActiveProvider();
  };

  const handleCreateProvider = () => {
    setSelectedProvider(null);
    setCreateDialogOpen(true);
  };

  const handleEditProvider = (provider: AIProvider) => {
    setSelectedProvider(provider);
    setCreateDialogOpen(true);
  };

  const handleDialogClose = () => {
    setCreateDialogOpen(false);
    setSelectedProvider(null);
    setTimeout(() => {
      refetchProviders();
      refetchActiveProvider();
    }, 100);
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'connected':
        return 'success';
      case 'disconnected':
        return 'warning';
      case 'error':
        return 'error';
      default:
        return 'default';
    }
  };

  const isLoading = isLoadingProviders || isLoadingActiveProvider;

  if (isLoading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="400px"
      >
        <CircularProgress />
        <Typography variant="body1" sx={{ ml: 2 }}>
          Loading providers...
        </Typography>
      </Box>
    );
  }

  if (providersError) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        Failed to load AI providers: {(providersError as any).message}
        <Button size="small" onClick={handleRefreshAll} sx={{ ml: 2 }}>
          Retry
        </Button>
      </Alert>
    );
  }

  return (
    <Box>
      {/* Tabs — tight gap below header */}
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v as TabLabel)}
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 2, mt: -1 }}
      >
        {TABS.map((tab) => (
          <Tab key={tab} label={tab} value={tab} />
        ))}
      </Tabs>

      {/* MCP Servers */}
      {activeTab === 'MCP Servers' && <MCPServersTab />}

      {/* Skills */}
      {activeTab === 'Skills' && <SkillsTab />}

      {/* Memory */}
      {activeTab === 'Memory' && <MemoryTab />}

      {/* General (was AI Settings) — includes DB info */}
      {activeTab === 'Settings' && (
        <Box>
          {/* AI Database Information */}
          <Paper elevation={1} sx={{ p: 2, mb: 3 }}>
            <Box
              display="flex"
              justifyContent="start"
              alignItems="center"
              gap={4}
              mb={2}
            >
              <Box display="flex" alignItems="center" gap={1}>
                <Storage />
                <Typography variant="h6">AI Database Information</Typography>
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  gap: 2,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}
              >
                <Chip
                  icon={<Info />}
                  label={`SQLite ${settingsWithDbInfo?.sqliteVersion || 'Unknown'}`}
                  variant="outlined"
                />
                <Chip
                  label={settingsWithDbInfo?.mainDatabaseSize || 'Unknown'}
                  variant="outlined"
                />
                <Chip
                  label={settingsWithDbInfo?.mainDatabaseStatus || 'Unknown'}
                  color={getStatusColor(settingsWithDbInfo?.mainDatabaseStatus)}
                  variant="filled"
                />
              </Box>
            </Box>
            <TextField
              fullWidth
              label="Database Location"
              variant="outlined"
              value={settingsWithDbInfo?.mainDatabasePath || 'Loading...'}
              disabled
              helperText="SQLite database file storing AI providers, conversations, and templates"
            />
          </Paper>

          <AISettingsTab />
        </Box>
      )}

      {/* Providers */}
      {activeTab === 'Providers' && (
        <Box>
          <Box display="flex" justifyContent="flex-end" mb={2}>
            {' '}
            <Box display="flex" gap={1}>
              <Button
                variant="outlined"
                startIcon={<Refresh />}
                onClick={handleRefreshAll}
              >
                Refresh
              </Button>
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={handleCreateProvider}
              >
                Add Provider
              </Button>
            </Box>
          </Box>

          {/* Active Provider */}
          {activeProvider && (
            <Box display="flex" alignItems="center" gap={2} mb={2}>
              <Typography variant="subtitle2" fontWeight="bold">
                Active Provider:
              </Typography>
              <Chip
                label={`${activeProvider.name} (${activeProvider.type})`}
                color="primary"
                size="small"
              />
            </Box>
          )}

          {/* No Providers */}
          {providers.length === 0 && (
            <Box sx={{ mt: 4, textAlign: 'center' }}>
              <Typography variant="h6" gutterBottom>
                No AI Providers Configured
              </Typography>
              <Typography variant="body2" color="text.secondary" mb={3}>
                Add your first AI provider to enable enhanced dbt functionality.
              </Typography>
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={handleCreateProvider}
              >
                Add Your First Provider
              </Button>
            </Box>
          )}

          {/* Providers Grid */}
          {providers.length > 0 && (
            <Grid container spacing={3}>
              {providers.map((provider) => (
                <Grid item xs={12} md={6} lg={4} key={provider.id}>
                  <ProviderCard
                    provider={provider}
                    isActive={activeProvider?.id === provider.id}
                    onEdit={handleEditProvider}
                    onRefresh={handleRefreshAll}
                  />
                </Grid>
              ))}
            </Grid>
          )}

          <CreateProviderDialog
            open={createDialogOpen}
            onClose={handleDialogClose}
            provider={selectedProvider}
          />
        </Box>
      )}
    </Box>
  );
};
