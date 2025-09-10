import React from 'react';
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Box,
} from '@mui/material';
import { toast } from 'react-toastify';
import { useGetProviderModels } from '../../controllers/aiProviders.controller';
import type { AIModel } from '../../controllers/aiProviders.controller';

interface SmartModelSelectorProps {
  providerId?: string; // For saved providers
  discoveredModels?: AIModel[]; // Models discovered from testing
  value?: string;
  onChange: (model: string) => void;
  label?: string;
  disabled?: boolean;
  fullWidth?: boolean;
}

export const SmartModelSelector: React.FC<SmartModelSelectorProps> = ({
  providerId,
  discoveredModels = [],
  value = '',
  onChange,
  label = 'Model',
  disabled = false,
  fullWidth = true,
}) => {
  const {
    data: dynamicModels = [],
    isLoading,
    error,
  } = useGetProviderModels(providerId, {
    enabled: !!providerId,
    onError: (err) => {
      toast.error(`Failed to load models: ${err?.message}`);
    },
  });

  // Determine which models to use - prioritize discovered models from testing
  let models: AIModel[] = [];

  if (discoveredModels.length > 0) {
    // Always prioritize discovered models when available (from testing)
    models = discoveredModels;
  } else if (providerId && dynamicModels.length > 0) {
    // Fallback to dynamic models for saved providers when no discovered models
    models = dynamicModels;
  }

  // Always include the current value as an option if it's not in the list
  const modelOptions = [...models];
  if (value && !models.find((m) => m.id === value)) {
    modelOptions.unshift({
      id: value,
      name: value,
      description: 'Current selected model',
      maxTokens: 0, // Unknown max tokens for current selected model
    });
  }

  return (
    <Box>
      <FormControl fullWidth={fullWidth} disabled={disabled}>
        <InputLabel id="model-select-label">{label}</InputLabel>
        <Select
          labelId="model-select-label"
          label={label}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        >
          {modelOptions.map((model) => (
            <MenuItem key={model.id} value={model.id}>
              <Box>
                <Typography variant="body2">
                  {model.name || model.id}
                </Typography>
                {model.description && (
                  <Typography variant="caption" color="text.secondary">
                    {model.description}
                  </Typography>
                )}
              </Box>
            </MenuItem>
          ))}
          {modelOptions.length === 0 && (
            <MenuItem disabled>
              <Typography variant="body2" color="text.secondary">
                No models available. Test connection to discover models.
              </Typography>
            </MenuItem>
          )}
        </Select>
      </FormControl>

      {/* Show model count and status */}
      {models.length > 0 && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 1, display: 'block' }}
        >
          {models.length} model{models.length === 1 ? '' : 's'} available
        </Typography>
      )}

      {isLoading && (
        <Typography
          variant="caption"
          color="primary"
          sx={{ mt: 1, display: 'block' }}
        >
          Loading models...
        </Typography>
      )}

      {error && (
        <Typography
          variant="caption"
          color="error"
          sx={{ mt: 1, display: 'block' }}
        >
          Failed to load models
        </Typography>
      )}
    </Box>
  );
};
