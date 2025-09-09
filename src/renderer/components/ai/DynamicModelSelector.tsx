import React from 'react';
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Box,
  CircularProgress,
} from '@mui/material';
import { toast } from 'react-toastify';
import { useGetProviderModels } from '../../controllers/aiProviders.controller';
import type { AIModel } from '../../controllers/aiProviders.controller';

interface DynamicModelSelectorProps {
  providerId?: string;
  value?: string;
  onChange: (model: string) => void;
  label?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  placeholder?: string;
}

export const DynamicModelSelector: React.FC<DynamicModelSelectorProps> = ({
  providerId,
  value = '',
  onChange,
  label = 'Model',
  disabled = false,
  fullWidth = true,
  placeholder = 'Select a model',
}) => {
  const {
    data: models = [],
    isLoading,
    error,
  } = useGetProviderModels(providerId, {
    enabled: !!providerId,
    onError: (err) => {
      toast.error(`Failed to load models: ${err.message}`);
    },
  });

  const handleChange = (event: any) => {
    onChange(event.target.value);
  };

  if (!providerId) {
    return (
      <FormControl fullWidth={fullWidth} disabled>
        <InputLabel>{label}</InputLabel>
        <Select value="" label={label}>
          <MenuItem value="">
            <Typography variant="body2" color="text.secondary">
              Select a provider first
            </Typography>
          </MenuItem>
        </Select>
      </FormControl>
    );
  }

  return (
    <FormControl fullWidth={fullWidth} disabled={disabled || isLoading}>
      <InputLabel>{label}</InputLabel>
      <Select
        value={value}
        onChange={handleChange}
        label={label}
        startAdornment={
          isLoading ? (
            <Box sx={{ mr: 1, display: 'flex', alignItems: 'center' }}>
              <CircularProgress size={16} />
            </Box>
          ) : null
        }
      >
        {isLoading && (
          <MenuItem value="">
            <Typography variant="body2" color="text.secondary">
              Loading models...
            </Typography>
          </MenuItem>
        )}

        {error && (
          <MenuItem value="">
            <Typography variant="body2" color="error">
              Failed to load models
            </Typography>
          </MenuItem>
        )}

        {!isLoading && !error && models.length === 0 && (
          <MenuItem value="">
            <Typography variant="body2" color="text.secondary">
              No models available
            </Typography>
          </MenuItem>
        )}

        {!isLoading && !error && (
          <>
            <MenuItem value="">
              <Typography variant="body2" color="text.secondary">
                {placeholder}
              </Typography>
            </MenuItem>
            {models.map((model: AIModel) => (
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
                  {model.maxTokens && (
                    <Typography variant="caption" color="text.secondary">
                      {' '}
                      • Max tokens: {model.maxTokens.toLocaleString()}
                    </Typography>
                  )}
                </Box>
              </MenuItem>
            ))}
          </>
        )}
      </Select>
    </FormControl>
  );
};
