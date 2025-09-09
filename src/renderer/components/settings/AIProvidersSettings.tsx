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
} from '@mui/material';
import { Add, Refresh } from '@mui/icons-material';
import { toast } from 'react-toastify';
import {
  useGetAIProviders,
  useGetActiveAIProvider,
  useInitializeProviderManager,
} from '../../controllers/aiProviders.controller';
import type { AIProvider } from '../../controllers/aiProviders.controller';
import { CreateProviderDialog, ProviderCard } from '../ai';

export const AIProvidersSettings: React.FC = () => {
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [selectedProvider, setSelectedProvider] =
    React.useState<AIProvider | null>(null);

  // Initialize provider manager on component mount
  const { mutate: initializeProviderManager, isLoading: isInitializing } =
    useInitializeProviderManager({
      onSuccess: () => {},
      onError: (error) => {
        toast.error(`Failed to initialize provider manager, ${error?.message}`);
      },
    });

  // Queries
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

  // Initialize on mount
  React.useEffect(() => {
    initializeProviderManager();
  }, [initializeProviderManager]);

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
    // Refresh data after dialog closes
    setTimeout(() => {
      refetchProviders();
      refetchActiveProvider();
    }, 100);
  };

  const isLoading =
    isInitializing || isLoadingProviders || isLoadingActiveProvider;

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
          {isInitializing
            ? 'Initializing AI providers...'
            : 'Loading providers...'}
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
      {/* Header */}
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={3}
      >
        <Box>
          <Typography variant="body2" color="text.secondary">
            Configure and manage AI providers for enhanced dbt functionality
          </Typography>
        </Box>
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

      {/* Active Provider Info */}
      {activeProvider && (
        <Paper elevation={1} sx={{ p: 2, mb: 3, bgcolor: 'primary.50' }}>
          <Box display="flex" alignItems="center" gap={2}>
            <Typography variant="subtitle1" fontWeight="bold">
              Active Provider:
            </Typography>
            <Chip
              label={`${activeProvider.name} (${activeProvider.type})`}
              color="primary"
              size="small"
            />
          </Box>
        </Paper>
      )}

      {/* No Providers State */}
      {providers.length === 0 && (
        <Paper elevation={1} sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" gutterBottom>
            No AI Providers Configured
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Add your first AI provider to enable enhanced dbt functionality like
            model generation, query optimization, and intelligent suggestions.
          </Typography>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={handleCreateProvider}
          >
            Add Your First Provider
          </Button>
        </Paper>
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

      {/* Create/Edit Provider Dialog */}
      <CreateProviderDialog
        open={createDialogOpen}
        onClose={handleDialogClose}
        provider={selectedProvider}
      />
    </Box>
  );
};
