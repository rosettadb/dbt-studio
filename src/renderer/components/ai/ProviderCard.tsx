import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@mui/material';
import {
  MoreVert,
  Edit,
  Delete,
  CheckCircle,
  RadioButtonUnchecked,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import {
  useSetActiveAIProvider,
  useDeleteAIProvider,
} from '../../controllers/aiProviders.controller';
import type {
  AIProvider,
  ProviderTestResult,
} from '../../controllers/aiProviders.controller';
import { ProviderStatusIndicator } from './ProviderStatusIndicator';
import { ProviderTestButton } from './ProviderTestButton';

interface ProviderCardProps {
  provider: AIProvider;
  isActive: boolean;
  healthStatus?: ProviderTestResult;
  onEdit: (provider: AIProvider) => void;
  onRefresh: () => void;
}

export const ProviderCard: React.FC<ProviderCardProps> = ({
  provider,
  isActive,
  healthStatus,
  onEdit,
  onRefresh,
}) => {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);

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

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleSetActive = () => {
    if (provider.id) {
      setActiveProvider(provider.id.toString());
    }
    handleMenuClose();
  };

  const handleEdit = () => {
    onEdit(provider);
    handleMenuClose();
  };

  const handleDelete = () => {
    if (provider.id && !isActive) {
      deleteProvider(provider.id);
    }
    handleMenuClose();
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

  return (
    <Card
      elevation={isActive ? 3 : 1}
      sx={{
        border: isActive ? 2 : 1,
        borderColor: isActive ? 'primary.main' : 'divider',
        position: 'relative',
        '&:hover': {
          elevation: 2,
          borderColor: isActive ? 'primary.main' : 'primary.light',
        },
      }}
    >
      {/* Active Badge */}
      {isActive && (
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 1,
          }}
        >
          <Chip
            label="Active"
            size="small"
            color="primary"
            icon={<CheckCircle />}
          />
        </Box>
      )}

      <CardContent>
        {/* Header */}
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="flex-start"
          mb={2}
        >
          <Box flex={1}>
            <Typography variant="h6" component="div" gutterBottom>
              {provider.name}
            </Typography>
            <Chip
              label={getProviderTypeLabel(provider.type)}
              size="small"
              sx={{
                bgcolor: getProviderTypeColor(provider.type),
                color: 'white',
                fontWeight: 'bold',
              }}
            />
          </Box>
          <IconButton size="small" onClick={handleMenuOpen} sx={{ ml: 1 }}>
            <MoreVert />
          </IconButton>
        </Box>

        {/* Status */}
        <Box mb={2}>
          <ProviderStatusIndicator status={healthStatus} isLoading={false} />
        </Box>

        {/* Actions */}
        <Box display="flex" gap={1} flexWrap="wrap">
          <ProviderTestButton
            providerId={provider.id?.toString() || ''}
            onTestComplete={onRefresh}
            size="small"
          />
          {!isActive && (
            <Button
              size="small"
              variant="outlined"
              onClick={handleSetActive}
              disabled={isSettingActive}
              startIcon={<RadioButtonUnchecked />}
            >
              Set Active
            </Button>
          )}
        </Box>

        {/* Created Date */}
        {provider.createdAt && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ mt: 2, display: 'block' }}
          >
            Created: {new Date(provider.createdAt).toLocaleDateString()}
          </Typography>
        )}
      </CardContent>

      {/* Context Menu */}
      <Menu
        anchorEl={anchorEl}
        open={menuOpen}
        onClose={handleMenuClose}
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        {!isActive && (
          <MenuItem onClick={handleSetActive} disabled={isSettingActive}>
            <ListItemIcon>
              <CheckCircle fontSize="small" />
            </ListItemIcon>
            <ListItemText>Set as Active</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={handleEdit}>
          <ListItemIcon>
            <Edit fontSize="small" />
          </ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        {!isActive && (
          <>
            <Divider />
            <MenuItem
              onClick={handleDelete}
              disabled={isDeleting}
              sx={{ color: 'error.main' }}
            >
              <ListItemIcon>
                <Delete fontSize="small" color="error" />
              </ListItemIcon>
              <ListItemText>Delete</ListItemText>
            </MenuItem>
          </>
        )}
      </Menu>
    </Card>
  );
};
