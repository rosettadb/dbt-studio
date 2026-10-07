import React from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  useTheme,
  Switch,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
} from '@mui/material';
import { Edit, Delete, Logout, Login } from '@mui/icons-material';
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
  useSignOutChatGpt,
} from '../../controllers/aiProviders.controller';
import type {
  AIProvider,
  ProviderTestResult,
} from '../../controllers/aiProviders.controller';
import { SettingsRow } from '../settings/SettingsLayout';

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

  const { mutate: signOutChatGpt, isLoading: isSigningOut } = useSignOutChatGpt(
    {
      onSuccess: () => {
        toast.success('Signed out of ChatGPT.');
        onRefresh();
      },
      onError: (error) => {
        toast.error(`Failed to sign out: ${error.message}`);
      },
    },
  );

  const handleTest = () => {
    if (!provider.id) {
      toast.error('No provider ID available');
      return;
    }
    testProvider(provider.id.toString());
  };

  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

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
        return 'Ollama';
      case 'gemini':
        return 'Google Gemini';
      case 'anthropic':
        return 'Anthropic Claude';
      case 'openai-codex':
        return 'ChatGPT (subscription)';
      default:
        return type.charAt(0).toUpperCase() + type.slice(1);
    }
  };

  const getProviderIcon = (type: string) => {
    const iconSrc = aiProviderImages[type as keyof typeof aiProviderImages];
    if (iconSrc) {
      return iconSrc;
    }
    return defaultIcon;
  };

  const getProviderConfig = () => {
    try {
      // Handle both string and object formats
      return typeof provider.config === 'string'
        ? JSON.parse(provider.config)
        : provider.config || {};
    } catch (error) {
      // If config is not valid JSON, treat it as empty
      return {};
    }
  };

  // Helper function to get model from config
  const getProviderModel = () => getProviderConfig().model || '';

  const isChatGpt = provider.type === 'openai-codex';
  const chatGptConfig = isChatGpt ? getProviderConfig() : {};
  // A signed-out ChatGPT provider can't run anything, so it can't be made
  // active until the user signs in. Deactivating stays allowed.
  const isSignedOutChatGpt = isChatGpt && chatGptConfig.signedOut === true;
  const isActiveSwitchDisabled =
    isSettingActive || isDeactivating || (!isActive && isSignedOutChatGpt);
  const getActiveSwitchTooltip = () => {
    if (isActive) return 'Active — click to deactivate';
    if (isSignedOutChatGpt) return 'Sign in to activate';
    return 'Set active';
  };
  const activeSwitchTooltip = getActiveSwitchTooltip();

  return (
    <>
      <SettingsRow
        label={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <img
              src={getProviderIcon(provider.type)}
              alt={`${provider.type} logo`}
              title={getProviderTypeLabel(provider.type)}
              aria-label={getProviderTypeLabel(provider.type)}
              style={{
                width: 18,
                height: 18,
                objectFit: 'contain',
                filter:
                  isDarkMode &&
                  provider.type !== 'gemini' &&
                  provider.type !== 'lmstudio'
                    ? 'brightness(0) invert(1) opacity(0.9)'
                    : undefined,
              }}
            />
            {provider.name}
            <Chip
              label={getProviderTypeLabel(provider.type)}
              size="small"
              variant="outlined"
            />
          </Box>
        }
        description={[
          `Model: ${getProviderModel() || 'No model configured'}`,
          isChatGpt &&
            (isSignedOutChatGpt
              ? 'Signed out'
              : chatGptConfig.accountEmail || 'ChatGPT account'),
        ]
          .filter(Boolean)
          .join(' · ')}
      >
        {isChatGpt &&
          (isSignedOutChatGpt ? (
            <Button size="small" startIcon={<Login />} onClick={handleEdit}>
              Sign in
            </Button>
          ) : (
            <Button
              size="small"
              startIcon={<Logout />}
              onClick={() => provider.id && signOutChatGpt(provider.id)}
              disabled={isSigningOut}
            >
              Sign out
            </Button>
          ))}
        <Button
          size="small"
          variant="outlined"
          onClick={handleTest}
          disabled={isTesting}
          startIcon={
            isTesting ? (
              <CircularProgress size={14} color="inherit" />
            ) : (
              <Box
                component="span"
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: getIndicatorColor(),
                }}
              />
            )
          }
        >
          {isTesting ? 'Testing...' : 'Test'}
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<Edit />}
          onClick={handleEdit}
        >
          Edit
        </Button>
        <Tooltip title={isActive ? 'Deactivate before deleting' : ''}>
          <span>
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<Delete />}
              onClick={handleDelete}
              disabled={isDeleting || isActive}
            >
              Delete
            </Button>
          </span>
        </Tooltip>
        <Tooltip title={activeSwitchTooltip}>
          {/* span: a disabled Switch fires no events, so the tooltip needs a wrapper */}
          <span>
            <Switch
              size="small"
              checked={isActive}
              onChange={handleSetActive}
              disabled={isActiveSwitchDisabled}
              color="success"
              inputProps={{ 'aria-label': activeSwitchTooltip }}
            />
          </span>
        </Tooltip>
      </SettingsRow>

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
    </>
  );
};
