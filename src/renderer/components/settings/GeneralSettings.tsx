import React from 'react';
import { TextField, IconButton, Box, Button } from '@mui/material';
import { FolderOpen, Save } from '@mui/icons-material';
import { SettingsType } from '../../../types/backend';
import { InstallationSettings } from './InstallationSettings';

interface GeneralSettingsProps {
  settings: SettingsType;
  onSettingsChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
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
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    onSettingsChange(e);
  };

  return (
    <Box mt={3}>
      <Box
        mb={4}
        maxWidth={800}
        display="flex"
        alignItems="center"
        justifyItems="center"
        gap={2}
      >
        <TextField
          fullWidth
          label="Projects Directory"
          variant="outlined"
          id="projectsDirectory"
          name="projectsDirectory"
          value={settings.projectsDirectory}
          onChange={handleChange}
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
        <Box>
          <Button
            type="submit"
            color="primary"
            variant="contained"
            startIcon={<Save />}
            sx={{
              padding: '8px 24px',
              fontWeight: '500',
            }}
          >
            Save
          </Button>
        </Box>
      </Box>

      <InstallationSettings />
    </Box>
  );
};
