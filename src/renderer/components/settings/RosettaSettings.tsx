import React from 'react';
import { TextField, Button, Box, Chip } from '@mui/material';
import { OpenInNew } from '@mui/icons-material';
import { SettingsType } from '../../../types/backend';
import { utils } from '../../helpers';

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
        disabled
        sx={{ mb: 2 }}
      />

      <Box sx={{ mb: 2 }}>
        <Chip
          label={`Version: ${settings.rosettaVersion || 'Not installed'}`}
          color={settings.rosettaVersion ? 'primary' : 'default'}
          size="small"
          variant="outlined"
        />
      </Box>

      <Box sx={{ mt: 1, mb: 3 }}>
        <Button
          startIcon={<OpenInNew />}
          color="primary"
          size="small"
          component="a"
          href="https://github.com/rosettadb/rosetta_cli?tab=readme-ov-file#getting-started"
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) =>
            utils.handleExternalLink(
              e,
              'https://github.com/rosettadb/rosetta_cli?tab=readme-ov-file#getting-started',
            )
          }
          sx={{ textTransform: 'none' }}
        >
          View RosettaDB documentation
        </Button>
      </Box>
    </>
  );
};
