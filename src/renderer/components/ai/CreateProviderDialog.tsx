import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  IconButton,
  InputAdornment,
  Alert,
} from '@mui/material';
import { Close, Visibility, VisibilityOff } from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'react-toastify';
import {
  useCreateAIProvider,
  useUpdateAIProvider,
} from '../../controllers/aiProviders.controller';
import { aiProvidersService } from '../../services/aiProviders.service';
import { SmartModelSelector } from './SmartModelSelector';
import { TestProviderConnection } from './TestProviderConnection';
import type {
  AIProvider,
  NewAIProvider,
} from '../../controllers/aiProviders.controller';

export const providerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50, 'Name too long'),
  type: z.enum(['openai', 'ollama', 'gemini', 'anthropic'], {
    errorMap: () => ({ message: 'Please select a provider type' }),
  }),
  apiKey: z.string().optional(),
  baseUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  model: z.string().optional(),
});

type ProviderFormData = z.infer<typeof providerSchema>;

interface CreateProviderDialogProps {
  open: boolean;
  onClose: () => void;
  provider?: AIProvider | null;
}

export const CreateProviderDialog: React.FC<CreateProviderDialogProps> = ({
  open,
  onClose,
  provider,
}) => {
  const [showApiKey, setShowApiKey] = React.useState(false);
  const [discoveredModels, setDiscoveredModels] = React.useState<any[]>([]);
  const isEdit = Boolean(provider);

  const { mutate: createProvider, isLoading: isCreating } = useCreateAIProvider(
    {
      onSuccess: () => {
        toast.success('AI Provider created successfully!');
        onClose();
      },
      onError: (error) => {
        toast.error(`Failed to create AI provider: ${error.message}`);
      },
    },
  );

  const { mutate: updateProvider, isLoading: isUpdating } = useUpdateAIProvider(
    {
      onSuccess: () => {
        toast.success('AI Provider updated successfully!');
        onClose();
      },
      onError: (error) => {
        toast.error(`Failed to update AI provider: ${error.message}`);
      },
    },
  );

  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isValid },
  } = useForm<ProviderFormData>({
    resolver: zodResolver(providerSchema),
    defaultValues: {
      name: '',
      type: 'openai',
      apiKey: '',
      baseUrl: '',
      model: '',
    },
  });

  const watchedType = watch('type');
  const watchedApiKey = watch('apiKey');
  const watchedBaseUrl = watch('baseUrl');

  // Reset form when dialog opens/closes or provider changes
  React.useEffect(() => {
    const clearForm = () => {
      reset({
        name: '',
        type: 'openai',
        apiKey: '',
        baseUrl: '',
        model: '',
      });
      setDiscoveredModels([]);
      setShowApiKey(false);
    };

    const loadProviderData = async () => {
      if (!open) {
        clearForm();
        return;
      }

      if (provider && isEdit) {
        // Handle both string and object formats
        const config =
          typeof provider.config === 'string'
            ? JSON.parse(provider.config)
            : provider.config || {};

        // Load API key from secure storage if provider type can use it
        let apiKey = config.apiKey || '';
        const providersNeedingCredentials = [
          'openai',
          'gemini',
          'anthropic',
          'ollama',
        ];
        if (providersNeedingCredentials.includes(provider.type)) {
          try {
            const storedApiKey = await aiProvidersService.getProviderCredential(
              provider.id!,
              provider.type,
            );
            if (storedApiKey) {
              apiKey = storedApiKey;
            }
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error(
              '[CREATE PROVIDER DIALOG] Failed to load API key:',
              error,
            );
          }
        }

        reset({
          name: provider.name,
          type: provider.type,
          apiKey,
          baseUrl: config.baseUrl || '',
          model: config.model || '',
        });
      } else {
        clearForm();
      }
    };

    loadProviderData();
  }, [open, provider, isEdit, reset]);

  // Handle test completion and discovered models
  const handleTestComplete = React.useCallback(
    (success: boolean, models?: any[]) => {
      if (success && models) {
        setDiscoveredModels(models);
      } else {
        setDiscoveredModels([]);
      }
    },
    [],
  );

  // Clear discovered models when provider type changes
  React.useEffect(() => {
    // Clear discovered models when provider type changes since they're type-specific
    setDiscoveredModels([]);
  }, [watchedType]);

  const onSubmit = (data: ProviderFormData) => {
    const config: any = {};

    if (data.apiKey) config.apiKey = data.apiKey;
    if (data.baseUrl) config.baseUrl = data.baseUrl;
    if (data.model) config.model = data.model;

    const providerData: NewAIProvider = {
      name: data.name,
      type: data.type,
      config: JSON.stringify(config),
      isActive: isEdit ? (provider?.isActive ?? false) : false,
    };

    if (isEdit && provider?.id) {
      updateProvider({ id: provider.id, updates: providerData });
    } else {
      createProvider(providerData);
    }
  };

  const getProviderRequirements = (type: string) => {
    switch (type) {
      case 'openai':
        return {
          requiresApiKey: true,
          apiKeyLabel: 'OpenAI API Key',
          apiKeyPlaceholder: 'sk-...',
          requiresBaseUrl: false,
          modelPlaceholder: 'gpt-4o (optional)',
        };
      case 'anthropic':
        return {
          requiresApiKey: true,
          apiKeyLabel: 'Anthropic API Key',
          apiKeyPlaceholder: 'sk-ant-...',
          requiresBaseUrl: false,
          modelPlaceholder: 'claude-3-sonnet-20240229 (optional)',
        };
      case 'gemini':
        return {
          requiresApiKey: true,
          apiKeyLabel: 'Google AI API Key',
          apiKeyPlaceholder: 'AI...',
          requiresBaseUrl: false,
          modelPlaceholder: 'gemini-2.5-flash (optional)',
        };
      case 'ollama':
        return {
          requiresApiKey: false,
          supportsOptionalApiKey: true,
          apiKeyLabel: 'Ollama API Key or Bearer Token',
          apiKeyPlaceholder:
            'Optional for self-hosted, required for ollama.com',
          requiresBaseUrl: true,
          modelPlaceholder: 'llama2 (optional)',
        };
      default:
        return {
          requiresApiKey: false,
          supportsOptionalApiKey: false,
          apiKeyLabel: '',
          apiKeyPlaceholder: '',
          requiresBaseUrl: false,
          modelPlaceholder: '',
        };
    }
  };

  const requirements = getProviderRequirements(watchedType);
  const isLoading = isCreating || isUpdating;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">
            {isEdit ? 'Edit AI Provider' : 'Add AI Provider'}
          </Typography>
          <IconButton onClick={onClose} size="small">
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      <Box
        component="form"
        onSubmit={(e) => {
          e.stopPropagation();
          handleSubmit(onSubmit)(e);
        }}
      >
        <DialogContent dividers>
          <Box display="flex" flexDirection="column" gap={3}>
            {/* Provider Name */}
            <Controller
              name="name"
              control={control}
              render={({ field }) => (
                <TextField
                  name={field.name}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  label="Provider Name"
                  placeholder="My OpenAI Provider"
                  fullWidth
                  error={!!errors.name}
                  helperText={errors.name?.message}
                />
              )}
            />

            {/* Provider Type */}
            <Controller
              name="type"
              control={control}
              render={({ field }) => (
                <FormControl fullWidth error={!!errors.type}>
                  <InputLabel>Provider Type</InputLabel>
                  <Select
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    label="Provider Type"
                  >
                    <MenuItem value="openai">OpenAI</MenuItem>
                    <MenuItem value="anthropic">Anthropic Claude</MenuItem>
                    <MenuItem value="gemini">Google Gemini</MenuItem>
                    <MenuItem value="ollama">Ollama</MenuItem>
                  </Select>
                  {errors.type && (
                    <Typography variant="caption" color="error">
                      {errors.type.message}
                    </Typography>
                  )}
                </FormControl>
              )}
            />

            {/* API Key */}
            {(requirements.requiresApiKey ||
              requirements.supportsOptionalApiKey) && (
              <Controller
                name="apiKey"
                control={control}
                render={({ field }) => (
                  <TextField
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    label={requirements.apiKeyLabel}
                    placeholder={requirements.apiKeyPlaceholder}
                    type={showApiKey ? 'text' : 'password'}
                    fullWidth
                    error={!!errors.apiKey}
                    helperText={
                      errors.apiKey?.message ||
                      (watchedType === 'ollama'
                        ? 'Optional for self-hosted Ollama, required for ollama.com'
                        : 'Stored securely and encrypted')
                    }
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            onClick={() => setShowApiKey(!showApiKey)}
                            edge="end"
                          >
                            {showApiKey ? <VisibilityOff /> : <Visibility />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                )}
              />
            )}

            {/* Base URL for Ollama */}
            {(watchedType === 'ollama' || requirements.requiresBaseUrl) && (
              <Controller
                name="baseUrl"
                control={control}
                render={({ field }) => (
                  <TextField
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    label="Base URL"
                    placeholder="http://localhost:11434"
                    fullWidth
                    error={!!errors.baseUrl}
                    helperText={
                      errors.baseUrl?.message ||
                      (watchedType === 'ollama'
                        ? 'Local, self-hosted, or hosted Ollama API URL'
                        : 'Custom API endpoint')
                    }
                  />
                )}
              />
            )}

            {/* Default Model */}
            <Controller
              name="model"
              control={control}
              render={({ field }) => {
                return (
                  <SmartModelSelector
                    key={`model-selector-${watchedType}`} // Force remount when provider type changes
                    providerId={
                      isEdit && provider ? String(provider.id) : undefined
                    }
                    discoveredModels={discoveredModels}
                    value={field.value}
                    onChange={field.onChange}
                    label="Default Model"
                    disabled={isLoading}
                    fullWidth
                  />
                );
              }}
            />

            {/* Test Connection */}
            <TestProviderConnection
              providerType={watchedType}
              apiKey={watchedApiKey}
              baseUrl={watchedBaseUrl}
              onTestComplete={handleTestComplete}
            />

            {/* Provider-specific info */}
            {watchedType === 'ollama' && (
              <Alert severity="info">
                Use a local Ollama server, a self-hosted remote server, or
                https://ollama.com/api. API keys are optional for self-hosted
                servers and required for ollama.com. Install local Ollama from{' '}
                <a
                  href="https://ollama.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'inherit' }}
                >
                  ollama.com
                </a>
              </Alert>
            )}
          </Box>
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={!isValid || isLoading}
          >
            {(() => {
              if (isLoading) {
                return isEdit ? 'Updating...' : 'Creating...';
              }
              return isEdit ? 'Update Provider' : 'Create Provider';
            })()}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
};
