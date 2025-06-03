import React from 'react';
import { toast } from 'react-toastify';
import {
  Button,
  IconButton,
  Typography,
  Box,
  Tooltip,
  List,
  ListItem,
  useTheme,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import { Close, Save, DarkMode, LightMode } from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useColorScheme } from '@mui/material/styles';
import AppsIcon from '@mui/icons-material/Apps';
import { SettingsType } from '../../../types/backend';
import {
  useFilePicker,
  useGetSettings,
  useUpdateSettings,
} from '../../controllers';
import { Container, StyledForm, StyledSettingsNavLink, Title } from './styles';
import {
  GeneralSettings,
  AIProviderSettings,
  DbtSettings,
  RosettaSettings,
  AboutSettings,
} from '../../components';
import { AppLayout } from '../../layouts';
import { settingsSidebarElements } from './settingsElements';

const Settings: React.FC = () => {
  const { mode, setMode } = useColorScheme();
  const theme = useTheme();
  const { data: settings } = useGetSettings();
  const { mutate: updateSettings } = useUpdateSettings({
    onSuccess: () => {
      toast.success('Settings successfully updated!');
    },
  });
  const { mutate: getFiles } = useFilePicker();
  const location = useLocation();
  const navigate = useNavigate();
  const currentSection = location.pathname.split('/').pop() || 'general';

  const [localSettings, setLocalSettings] = React.useState<SettingsType>({
    rosettaPath: '',
    rosettaVersion: '',
    projectsDirectory: '',
    dbtPath: '',
    dbtVersion: '',
    dbtSampleDirectory: '',
    sampleRosettaMainConf: '',
    pythonPath: '',
    pythonVersion: '',
    pythonBinary: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setLocalSettings((prevSettings) => ({
      ...prevSettings,
      [name]: value,
    }));
  };

  const handleChangeV2 = (name: string, value: string) => {
    const newSettings = { ...localSettings, [name]: value };
    setLocalSettings(newSettings);
    updateSettings(newSettings);
  };

  const handleFilePicker = async (
    name: keyof SettingsType,
    isDir: boolean,
    defaultPath?: string,
  ) => {
    getFiles(
      { properties: [isDir ? 'openDirectory' : 'openFile'], defaultPath },
      {
        onSuccess: (data) => {
          setLocalSettings((prevSettings) => ({
            ...prevSettings,
            [name]: data[0] ?? prevSettings[name],
          }));
        },
      },
    );
  };

  const handleClose = () => {
    navigate('/app');
  };

  const handleToggleTheme = () => {
    setMode(mode === 'light' ? 'dark' : 'light');
  };

  React.useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
    }
  }, [settings]);

  // Render content based on current section
  const renderContent = () => {
    switch (currentSection) {
      case 'general':
        return (
          <GeneralSettings
            settings={localSettings}
            onSettingsChange={handleChange}
            onFilePicker={handleFilePicker}
          />
        );
      case 'ai-providers':
        return (
          <AIProviderSettings
            settings={localSettings}
            onSettingsChange={handleChange}
          />
        );
      case 'dbt':
        return (
          <DbtSettings
            settings={localSettings}
            onInstallDbtSave={handleChangeV2}
            onSettingsChange={handleChange}
            onFilePicker={handleFilePicker}
          />
        );
      case 'rosetta':
        return (
          <RosettaSettings
            settings={localSettings}
            onSettingsChange={handleChange}
            onFilePicker={handleFilePicker}
          />
        );
      case 'about':
        return <AboutSettings />;
      default:
        return <Typography>Select a settings category</Typography>;
    }
  };

  return (
    <AppLayout
      sidebarContent={
        <Box sx={{ p: 2 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              mb: 2,
              gap: 1,
              justifyContent: 'space-between',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AppsIcon color="primary" fontSize="small" />
              <Typography variant="h6" sx={{ m: 0 }}>
                Settings
              </Typography>
            </Box>
            <Tooltip
              title={
                mode === 'dark'
                  ? 'Switch to Light Theme'
                  : 'Switch to Dark Theme'
              }
            >
              <IconButton
                aria-label="toggle theme"
                onClick={handleToggleTheme}
                color="primary"
                size="small"
              >
                {mode === 'dark' ? (
                  <LightMode fontSize="small" />
                ) : (
                  <DarkMode fontSize="small" />
                )}
              </IconButton>
            </Tooltip>
          </Box>
          <List
            sx={{
              py: 0,
              width: '100%',
              '& .MuiListItem-root': {
                py: 0.25,
                px: 1,
                minHeight: '32px',
                width: '100%',
              },
            }}
          >
            {settingsSidebarElements.map((element) => (
              <StyledSettingsNavLink key={element.text} to={element.path}>
                <ListItem
                  sx={{
                    cursor: 'pointer',
                    borderRadius: 1,
                    mb: 0,
                    width: '100%',
                    backgroundColor:
                      location.pathname === element.path
                        ? theme.palette.divider
                        : 'transparent',
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <element.icon
                      fontSize="small"
                      color={
                        location.pathname === element.path
                          ? 'primary'
                          : 'inherit'
                      }
                    />
                  </ListItemIcon>
                  <ListItemText primary={element.text} />
                </ListItem>
              </StyledSettingsNavLink>
            ))}
          </List>
        </Box>
      }
    >
      <Container>
        <StyledForm
          onSubmit={(event) => {
            event.preventDefault();
            updateSettings(localSettings);
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
            }}
          >
            <Title style={{ margin: 0 }}>
              {currentSection === 'dbt'
                ? 'dbt™'
                : currentSection.charAt(0).toUpperCase() +
                  currentSection.slice(1).replace('-', ' ')}
            </Title>
            <IconButton onClick={handleClose} edge="end" aria-label="close">
              <Close />
            </IconButton>
          </div>
          <div style={{ maxWidth: '600px' }}>{renderContent()}</div>

          {currentSection !== 'about' && (
            <Box sx={{ mt: 3 }}>
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
          )}
        </StyledForm>
      </Container>
    </AppLayout>
  );
};

export default Settings;
