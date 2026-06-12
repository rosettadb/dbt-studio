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
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  Tooltip,
} from '@mui/material';
import {
  Close,
  Visibility,
  VisibilityOff,
  ExpandMore,
  ContentCopy,
} from '@mui/icons-material';
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
  type: z.enum(
    [
      'openai',
      'ollama',
      'gemini',
      'anthropic',
      'openai-compatible',
      'lmstudio',
    ],
    {
      errorMap: () => ({ message: 'Please select a provider type' }),
    },
  ),
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
          'lmstudio',
          'openai-compatible',
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
          baseUrlPlaceholder: 'http://localhost:11434',
          modelPlaceholder: 'llama2 (optional)',
        };
      case 'lmstudio':
        return {
          requiresApiKey: false,
          supportsOptionalApiKey: true,
          apiKeyLabel: 'API Key (optional)',
          apiKeyPlaceholder:
            'Required only for cloud-hosted LM Studio endpoints',
          requiresBaseUrl: true,
          baseUrlPlaceholder: 'http://localhost:1234/v1',
          baseUrlHelperText:
            'Local LM Studio server URL. Change only if using a non-default port or a cloud-hosted deployment.',
          modelPlaceholder: 'llama-3.2-1b (auto-discovered if left blank)',
        };
      case 'openai-compatible':
        return {
          requiresApiKey: false,
          supportsOptionalApiKey: true,
          apiKeyLabel: 'API Key (optional)',
          apiKeyPlaceholder:
            'Bearer token or API key if the server requires auth',
          requiresBaseUrl: true,
          baseUrlPlaceholder: 'https://api.your-provider.com/v1',
          baseUrlHelperText:
            'Base URL of any OpenAI-compatible server (LLM inference, local proxies, etc.)',
          modelPlaceholder:
            'Model ID — required if server does not expose /v1/models',
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
                    <MenuItem value="lmstudio">LM Studio</MenuItem>
                    <MenuItem value="openai-compatible">
                      OpenAI Compatible
                    </MenuItem>
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

            {/* Base URL */}
            {(watchedType === 'ollama' ||
              watchedType === 'lmstudio' ||
              watchedType === 'openai-compatible' ||
              requirements.requiresBaseUrl) && (
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
                    placeholder={
                      (requirements as any).baseUrlPlaceholder ||
                      'http://localhost:11434'
                    }
                    fullWidth
                    error={!!errors.baseUrl}
                    helperText={
                      errors.baseUrl?.message ||
                      (requirements as any).baseUrlHelperText ||
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

            {watchedType === 'lmstudio' && (
              <Alert severity="info">
                LM Studio runs a local OpenAI-compatible server. Start it from
                the <strong>Local Server</strong> tab in LM Studio (default port
                1234). For cloud-hosted LM model deployments, set the remote
                Base URL and add an API key.{' '}
                <a
                  href="https://lmstudio.ai/docs/basics/server"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'inherit' }}
                >
                  LM Studio docs
                </a>
              </Alert>
            )}

            {watchedType === 'openai-compatible' && (
              <Box>
                <Alert severity="info" sx={{ mb: 2 }}>
                  Connect to any server that implements the OpenAI Chat
                  Completions API — local inference servers, cloud proxies, or
                  custom deployments.
                </Alert>
                <Accordion variant="outlined" elevation={0}>
                  <AccordionSummary expandIcon={<ExpandMore />}>
                    <Typography variant="body2" fontWeight="medium">
                      Popular Compatible API Endpoints
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ p: 0 }}>
                    <List dense>
                      {[
                        {
                          name: 'OpenRouter',
                          url: 'https://openrouter.ai/api/v1',
                        },
                        {
                          name: 'NVIDIA NIM',
                          url: 'https://integrate.api.nvidia.com/v1',
                        },
                        { name: 'DeepSeek', url: 'https://api.deepseek.com' },
                        { name: 'Groq', url: 'https://api.groq.com/openai/v1' },
                        {
                          name: 'Together AI',
                          url: 'https://api.together.xyz/v1',
                        },
                        {
                          name: 'Clarifai',
                          url: 'https://api.clarifai.com/v2/ext/openai/v1',
                        },
                        {
                          name: 'NEAR AI Cloud',
                          url: 'https://cloud-api.near.ai/v1',
                        },
                        {
                          name: 'Heroku (Custom App)',
                          url: 'https://<YOUR_APP_NAME>.herokuapp.com/v1',
                        },
                      ].map((endpoint) => (
                        <ListItem
                          key={endpoint.name}
                          secondaryAction={
                            <Tooltip title="Copy URL">
                              <IconButton
                                edge="end"
                                size="small"
                                onClick={() => {
                                  navigator.clipboard.writeText(endpoint.url);
                                  toast.success(`${endpoint.name} URL copied!`);
                                }}
                              >
                                <ContentCopy fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          }
                        >
                          <ListItemText
                            primary={endpoint.name}
                            secondary={endpoint.url}
                            primaryTypographyProps={{
                              variant: 'body2',
                              fontWeight: 'medium',
                            }}
                            secondaryTypographyProps={{
                              variant: 'caption',
                              sx: { fontFamily: 'monospace' },
                            }}
                          />
                        </ListItem>
                      ))}
                    </List>
                  </AccordionDetails>
                </Accordion>
              </Box>
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
