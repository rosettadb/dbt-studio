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

export interface SmartModelSelectorProps {
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

  const streamingModels = models.filter(
    (model) => model.supportsStreaming !== false,
  );

  const modelOptions: AIModel[] = [...streamingModels];

  if (value && !models.find((m) => m.id === value)) {
    modelOptions.unshift({
      id: value,
      name: value,
      description: 'Current selected model',
      maxTokens: 0,
      supportsStreaming: true,
    });
  }

  const hiddenModelCount = models.length - streamingModels.length;

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
                <Typography variant="body2" fontWeight="medium">
                  {model.name || model.id}
                </Typography>
                {model.description && (
                  <Typography variant="caption" color="text.secondary">
                    {model.description}
                  </Typography>
                )}
                {model.maxTokens > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    Max tokens: {model.maxTokens.toLocaleString()}
                  </Typography>
                )}
              </Box>
            </MenuItem>
          ))}
          {modelOptions.length === 0 && (
            <MenuItem disabled>
              <Typography variant="body2" color="text.secondary">
                No streaming-capable models available. Test connection to
                refresh.
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

      {hiddenModelCount > 0 && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block' }}
        >
          {hiddenModelCount} model{hiddenModelCount === 1 ? '' : 's'} omitted
          because streaming is not supported.
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
