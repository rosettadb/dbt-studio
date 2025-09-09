import React from 'react';
import { TextField, IconButton, Typography, Box, Chip } from '@mui/material';
import { FolderOpen, Storage, Info } from '@mui/icons-material';
import { SettingsType } from '../../../types/backend';
import { useGetSettingsWithDatabaseInfo } from '../../controllers';

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

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'connected':
        return 'success';
      case 'disconnected':
        return 'warning';
      case 'error':
        return 'error';
      default:
        return 'default';
    }
  };

  return (
    <Box>
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

      {/* AI Database Information Section */}
      <Box sx={{ mt: 4, mb: 2 }}>
        <Typography
          variant="h6"
          sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}
        >
          <Storage /> AI Database Information
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            fullWidth
            label="Database Location"
            variant="outlined"
            value={settingsWithDbInfo?.mainDatabasePath || 'Loading...'}
            disabled
            helperText="SQLite database file storing AI providers, conversations, and templates"
          />

          <Box
            sx={{
              display: 'flex',
              gap: 2,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <Chip
              icon={<Info />}
              label={`SQLite ${settingsWithDbInfo?.sqliteVersion || 'Unknown'}`}
              variant="outlined"
            />
            <Chip
              label={settingsWithDbInfo?.mainDatabaseSize || 'Unknown'}
              variant="outlined"
            />
            <Chip
              label={settingsWithDbInfo?.mainDatabaseStatus || 'Unknown'}
              color={getStatusColor(settingsWithDbInfo?.mainDatabaseStatus)}
              variant="filled"
            />
          </Box>

          <Typography variant="body2" color="text.secondary">
            This database stores AI provider configurations, chat conversations,
            message history, prompt templates, and usage analytics. It operates
            independently from your existing project settings and database
            connections.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};
