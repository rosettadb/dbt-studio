import React from 'react';
import { TextField } from '@mui/material';
import { SettingsType } from '../../../types/backend';

interface AIProviderSettingsProps {
  settings: SettingsType;
  onSettingsChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const AIProviderSettings: React.FC<AIProviderSettingsProps> = ({
  settings,
  onSettingsChange,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSettingsChange(e);
  };

  return (
    <TextField
      fullWidth
      label="Open AI API Key"
      variant="outlined"
      id="openAIApiKey"
      name="openAIApiKey"
      value={settings.openAIApiKey}
      onChange={handleChange}
      sx={{ mb: 2 }}
    />
  );
};
