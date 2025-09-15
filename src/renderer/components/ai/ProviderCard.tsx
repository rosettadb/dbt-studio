import React from 'react';
import {
  Card,
  // CardHeader removed - using Box layout instead
  CardContent,
  CardActions,
  Typography,
  Box,
  Button,
  Chip,
  CircularProgress,
  useTheme,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
} from '@mui/material';
import {
  Edit,
  Delete,
  CheckCircle,
  RadioButtonUnchecked,
  Cable,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import {
  aiProviderImages,
  defaultIcon,
} from '../../../../assets/connectionIcons';
import {
  useSetActiveAIProvider,
  useDeleteAIProvider,
  useTestAIProvider,
  useDeactivateAllAIProviders,
} from '../../controllers/aiProviders.controller';
import type {
  AIProvider,
  ProviderTestResult,
} from '../../controllers/aiProviders.controller';

interface ProviderCardProps {
  provider: AIProvider;
  isActive: boolean;
  onEdit: (provider: AIProvider) => void;
  onRefresh: () => void;
}

export const ProviderCard: React.FC<ProviderCardProps> = ({
  provider,
  isActive,
  onEdit,
  onRefresh,
}) => {
  // theme removed (not needed after layout changes)
  const [connectionStatus, setConnectionStatus] = React.useState<
    'idle' | 'success' | 'failed'
  >('idle');
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);

  const { mutate: setActiveProvider, isLoading: isSettingActive } =
    useSetActiveAIProvider({
      onSuccess: () => {
        toast.success('Provider set as active successfully!');
        onRefresh();
      },
      onError: (error) => {
        toast.error(`Failed to set provider as active: ${error.message}`);
      },
    });

  const { mutate: deactivateAllProviders, isLoading: isDeactivating } =
    useDeactivateAllAIProviders({
      onSuccess: () => {
        toast.success('All providers deactivated successfully!');
        onRefresh();
      },
      onError: (error) => {
        toast.error(`Failed to deactivate providers: ${error.message}`);
      },
    });

  const { mutate: deleteProvider, isLoading: isDeleting } = useDeleteAIProvider(
    {
      onSuccess: () => {
        toast.success('Provider deleted successfully!');
        onRefresh();
      },
      onError: (error) => {
        toast.error(`Failed to delete provider: ${error.message}`);
      },
    },
  );

  const { mutate: testProvider, isLoading: isTesting } = useTestAIProvider({
    onMutate: () => {
      setConnectionStatus('idle');
    },
    onSuccess: (result: ProviderTestResult) => {
      if (result.success) {
        toast.success(
          `Provider test successful! ${result.latencyMs ? `(${result.latencyMs}ms)` : ''}`,
        );
        setConnectionStatus('success');
      } else {
        toast.error(`Provider test failed: ${result.error}`);
        setConnectionStatus('failed');
      }
    },
    onError: (error) => {
      const errorMessage = (error as any).message || 'Test failed';
      toast.error(`Provider test failed: ${errorMessage}`);
      setConnectionStatus('failed');
    },
  });

  const handleTest = () => {
    if (!provider.id) {
      toast.error('No provider ID available');
      return;
    }
    testProvider(provider.id.toString());
  };

  const theme = useTheme();

  // Helper function to get indicator color based on connection status
  const getIndicatorColor = () => {
    switch (connectionStatus) {
      case 'success':
        return theme.palette.success.main;
      case 'failed':
        return theme.palette.error.main;
      default:
        return '#9e9e9e'; // silver/grey for idle state
    }
  };

  const handleSetActive = () => {
    if (provider.id) {
      if (isActive) {
        // Deactivate all providers
        deactivateAllProviders();
      } else {
        setActiveProvider(provider.id.toString());
      }
    }
  };

  const handleEdit = () => {
    onEdit(provider);
  };

  const handleDelete = () => {
    if (provider.id && !isActive) {
      setDeleteDialogOpen(true);
    }
  };

  const handleConfirmDelete = () => {
    if (provider.id && !isActive) {
      deleteProvider(provider.id);
      setDeleteDialogOpen(false);
    }
  };

  const getProviderTypeLabel = (type: string) => {
    switch (type) {
      case 'openai':
        return 'OpenAI';
      case 'ollama':
        return 'Ollama (beta)';
      case 'gemini':
        return 'Google Gemini';
      case 'anthropic':
        return 'Anthropic Claude (beta)';
      default:
        return type.charAt(0).toUpperCase() + type.slice(1);
    }
  };

  const getProviderTypeColor = (type: string) => {
    switch (type) {
      case 'openai':
        return '#10A37F';
      case 'ollama':
        return '#FF6B35';
      case 'gemini':
        return '#4285F4';
      case 'anthropic':
        return '#CD7F32';
      default:
        return '#666';
    }
  };

  const getProviderIcon = (type: string) => {
    const iconSrc = aiProviderImages[type as keyof typeof aiProviderImages];
    if (iconSrc) {
      return iconSrc;
    }
    return defaultIcon;
  };

  // Helper function to get model from config
  const getProviderModel = () => {
    try {
      const config = provider.config ? JSON.parse(provider.config) : {};
      return config.model || '';
    } catch (error) {
      // If config is not valid JSON, return empty string
      return '';
    }
  };

  return (
    <Card
      sx={{
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        transition: 'all 0.3s ease',
        border: isActive ? 2 : 1,
        borderColor: isActive ? 'primary.main' : 'divider',
        '&:hover': {
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          transform: 'translateY(-2px)',
        },
      }}
    >
      {/* Header with title and icon */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          pt: 2,
          pb: 2,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <Box
            sx={{
              width: 48,
              height: 48,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img
              src={getProviderIcon(provider.type)}
              alt={`${provider.type} logo`}
              title={getProviderTypeLabel(provider.type)}
              aria-label={getProviderTypeLabel(provider.type)}
              style={{ width: 40, height: 40, objectFit: 'contain' }}
            />
          </Box>

          <Box>
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 'bold',
              }}
            >
              {provider.name}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                bgcolor: getProviderTypeColor(provider.type),
                padding: '2px 4px',
                borderRadius: '4px',
              }}
            >
              {getProviderTypeLabel(provider.type)}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {isActive ? (
            <Chip
              label="Active"
              size="small"
              color="success"
              sx={{ fontWeight: 'bold' }}
            />
          ) : null}
        </Box>
      </Box>

      <CardContent sx={{ pt: 0 }}>
        {/* Model Information */}
        <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Model:
          </Typography>
          <Typography
            variant="body1"
            sx={{
              fontWeight: 'medium',
              color: getProviderModel() ? 'text.primary' : 'text.secondary',
              fontStyle: getProviderModel() ? 'normal' : 'italic',
            }}
          >
            {getProviderModel() || 'No model configured'}
          </Typography>
        </Box>

        <Button
          size="small"
          variant={isActive ? 'contained' : 'outlined'}
          color={isActive ? 'success' : 'primary'}
          onClick={handleSetActive}
          disabled={isSettingActive || isDeactivating}
          startIcon={isActive ? <CheckCircle /> : <RadioButtonUnchecked />}
        >
          {isActive ? 'Deactivate' : 'Set Active'}
        </Button>
      </CardContent>

      <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            variant="outlined"
            onClick={handleTest}
            disabled={isTesting}
            startIcon={
              isTesting ? (
                <CircularProgress size={16} color="inherit" sx={{ mr: 1 }} />
              ) : (
                <Cable color="primary" />
              )
            }
            sx={{
              position: 'relative',
              paddingRight: '36px',
              minWidth: '120px',
            }}
          >
            {isTesting ? 'Testing...' : 'Test'}
            <Box
              sx={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: getIndicatorColor(),
                border: `1px solid ${theme.palette.primary.contrastText}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            />
          </Button>
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Edit />}
            onClick={handleEdit}
          >
            Edit
          </Button>
          {!isActive && (
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<Delete />}
              onClick={handleDelete}
              disabled={isDeleting}
              sx={{
                borderRadius: '8px',
                '&:hover': {
                  backgroundColor: 'error.light',
                  color: 'error.contrastText',
                  borderColor: 'error.light',
                },
              }}
            >
              Delete
            </Button>
          )}
        </Box>
      </CardActions>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Delete AI Provider</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete the provider &ldquo;{provider.name}
            &rdquo;? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleConfirmDelete}
            color="error"
            variant="contained"
            disabled={isDeleting}
            startIcon={isDeleting ? <CircularProgress size={16} /> : null}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};
