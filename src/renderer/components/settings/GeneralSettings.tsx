import React from 'react';
import { TextField, IconButton, Typography, Box, Chip } from '@mui/material';
import { FolderOpen, Storage, Info } from '@mui/icons-material';
import { SettingsType } from '../../../types/backend';
import { useGetSettingsWithDatabaseInfo } from '../../controllers';
import { InstallationSettings } from './InstallationSettings';

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
  const { data: settingsWithDbInfo } = useGetSettingsWithDatabaseInfo();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSettingsChange(e);
  };

  return (
    <Box>
      <InstallationSettings />
      <TextField
        fullWidth
        label="Projects Directory"
        variant="outlined"
        id="projectsDirectory"
        name="projectsDirectory"
        value={settings.projectsDirectory}
        onChange={handleChange}
        sx={{ mt: 6, maxWidth: '600px' }}
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
    </Box>
  );
};
