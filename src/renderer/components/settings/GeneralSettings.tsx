import React from 'react';
import {
  TextField,
  IconButton,
  Button,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { useColorScheme } from '@mui/material/styles';
import {
  DarkMode,
  FolderOpen,
  FolderOutlined,
  LightMode,
  PaletteOutlined,
  Save,
} from '@mui/icons-material';
import AppsIcon from '@mui/icons-material/Apps';
import { SettingsType } from '../../../types/backend';
import { useGetSettings } from '../../controllers';
import { InstallationSettings } from './InstallationSettings';
import { SettingsRow, SettingsSection, SettingsStack } from './SettingsLayout';

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
  const { mode, setMode } = useColorScheme();
  const { data: savedSettings } = useGetSettings();
  const hasUnsavedProjectsDirectory =
    savedSettings !== undefined &&
    savedSettings.projectsDirectory !== settings.projectsDirectory;

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    onSettingsChange(e);
  };

  return (
    <SettingsStack>
      <SettingsSection title="Workspace" icon={<FolderOutlined />}>
        <SettingsRow
          label="Projects directory"
          description="New and cloned projects are created here"
        >
          <TextField
            size="small"
            sx={{ width: 340 }}
            id="projectsDirectory"
            name="projectsDirectory"
            value={settings.projectsDirectory}
            onChange={handleChange}
            slotProps={{
              input: {
                sx: { fontSize: 12.5 },
                endAdornment: (
                  <IconButton
                    size="small"
                    onClick={() =>
                      onFilePicker(
                        'projectsDirectory',
                        true,
                        settings.projectsDirectory,
                      )
                    }
                    edge="end"
                  >
                    <FolderOpen fontSize="small" />
                  </IconButton>
                ),
              },
            }}
          />
          {hasUnsavedProjectsDirectory && (
            <Button
              type="submit"
              size="small"
              variant="contained"
              startIcon={<Save />}
            >
              Save
            </Button>
          )}
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Appearance" icon={<PaletteOutlined />}>
        <SettingsRow
          label="Theme"
          description="System follows your operating system setting"
        >
          <ToggleButtonGroup
            size="small"
            exclusive
            value={mode}
            onChange={(_, value) => value && setMode(value)}
            sx={{
              '& .MuiToggleButton-root': {
                px: 1.25,
                py: 0.25,
                gap: 0.5,
                textTransform: 'none',
              },
            }}
          >
            <ToggleButton value="light">
              <LightMode sx={{ fontSize: 16 }} />
              Light
            </ToggleButton>
            <ToggleButton value="dark">
              <DarkMode sx={{ fontSize: 16 }} />
              Dark
            </ToggleButton>
            <ToggleButton value="system">
              <AppsIcon sx={{ fontSize: 16 }} />
              System
            </ToggleButton>
          </ToggleButtonGroup>
        </SettingsRow>
      </SettingsSection>
      <InstallationSettings />
    </SettingsStack>
  );
};
