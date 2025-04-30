import React from 'react';
import { TextField, IconButton } from '@mui/material';
import { FolderOpen } from '@mui/icons-material';
import { SettingsType } from '../../../types/backend';

interface GeneralSettingsProps {
  settings: SettingsType;
  onSettingsChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFilePicker: (
    name: keyof SettingsType,
    isDir: boolean,
    defaultPath?: string,
  ) => void;
}

export const GeneralSettings: React.FC<GeneralSettingsProps> = ({
  settings,
  onSettingsChange,
  onFilePicker,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSettingsChange(e);
  };

  return (
    <TextField
      fullWidth
      label="Projects Directory"
      variant="outlined"
      id="projectsDirectory"
      name="projectsDirectory"
      value={settings.projectsDirectory}
      onChange={handleChange}
      sx={{ mb: 2 }}
      slotProps={{
        input: {
          endAdornment: (
            <IconButton
              onClick={() =>
                onFilePicker(
                  'projectsDirectory',
                  true,
                  settings.projectsDirectory,
                )
              }
              edge="end"
            >
              <FolderOpen />
            </IconButton>
          ),
        },
      }}
    />
  );
};
