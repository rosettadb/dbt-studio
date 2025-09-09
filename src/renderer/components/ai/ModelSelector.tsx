import React from 'react';
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  CircularProgress,
  Box,
} from '@mui/material';
import { toast } from 'react-toastify';
import { useGetProviderModels } from '../../controllers/aiProviders.controller';
import type { AIModel } from '../../controllers/aiProviders.controller';

interface ModelSelectorProps {
  providerId?: string;
  value?: string;
  onChange: (model: string) => void;
  label?: string;
  disabled?: boolean;
  fullWidth?: boolean;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  providerId,
  value = '',
  onChange,
  label = 'Model',
  disabled = false,
  fullWidth = true,
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

  if (isLoading) {
    return (
      <FormControl fullWidth={fullWidth} disabled>
        <InputLabel>{label}</InputLabel>
        <Select value="" label={label}>
          <MenuItem value="">
            <Box display="flex" alignItems="center" gap={1}>
              <CircularProgress size={16} />
              <Typography variant="body2">Loading models...</Typography>
            </Box>
          </MenuItem>
        </Select>
      </FormControl>
    );
  }

  if (error) {
    return (
      <FormControl fullWidth={fullWidth} disabled={disabled}>
        <InputLabel>{label}</InputLabel>
        <Select value={value} onChange={handleChange} label={label}>
          <MenuItem value="">
            <Typography variant="body2" color="error">
              Failed to load models
            </Typography>
          </MenuItem>
        </Select>
      </FormControl>
    );
  }

  return (
    <FormControl fullWidth={fullWidth} disabled={disabled}>
      <InputLabel>{label}</InputLabel>
      <Select value={value} onChange={handleChange} label={label}>
        <MenuItem value="">
          <Typography variant="body2" color="text.secondary">
            Use provider default
          </Typography>
        </MenuItem>
        {models.map((model: AIModel) => (
          <MenuItem key={model.id} value={model.id}>
            <Box>
              <Typography variant="body2" fontWeight="medium">
                {model.name}
              </Typography>
              {model.description && (
                <Typography variant="caption" color="text.secondary">
                  {model.description}
                </Typography>
              )}
              {model.costPer1kTokens && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ ml: 1 }}
                >
                  • ${model.costPer1kTokens.input}/$
                  {model.costPer1kTokens.output} per 1K tokens
                </Typography>
              )}
            </Box>
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};
