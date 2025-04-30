import React from 'react';
import { TextField, IconButton, Button, Box } from '@mui/material';
import { FolderOpen, OpenInNew } from '@mui/icons-material';
import { SettingsType } from '../../../types/backend';

interface RosettaSettingsProps {
  settings: SettingsType;
  onSettingsChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFilePicker: (
    name: keyof SettingsType,
    isDir: boolean,
    defaultPath?: string,
  ) => void;
}

export const RosettaSettings: React.FC<RosettaSettingsProps> = ({
  settings,
  onSettingsChange,
  onFilePicker,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSettingsChange(e);
  };

  return (
    <>
      <TextField
        fullWidth
        label="Rosetta Path"
        variant="outlined"
        id="rosettaPath"
        name="rosettaPath"
        value={settings.rosettaPath}
        onChange={handleChange}
        sx={{ mb: 2 }}
        slotProps={{
          input: {
            endAdornment: (
              <IconButton
                onClick={() =>
                  onFilePicker('rosettaPath', false, settings.rosettaPath)
                }
                edge="end"
              >
                <FolderOpen />
              </IconButton>
            ),
          },
        }}
      />

      <Box sx={{ mt: 1, mb: 3 }}>
        <Button
          startIcon={<OpenInNew />}
          color="primary"
          size="small"
          component="a"
          href="https://github.com/AdaptiveScale/rosetta?tab=readme-ov-file#getting-started"
          target="_blank"
          rel="noopener noreferrer"
          sx={{ textTransform: 'none' }}
        >
          View RosettaDB documentation
        </Button>
      </Box>
    </>
  );
};
