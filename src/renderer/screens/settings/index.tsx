import React from 'react';
import { toast } from 'react-toastify';
import {
  Button,
  IconButton,
  Typography,
  Box,
  List,
  ListItem,
  useTheme,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import { Close, DarkMode, LightMode } from '@mui/icons-material';
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
  ProfileSettings,
  DbtSettings,
  RosettaSettings,
  AboutSettings,
  AIProvidersSettings,
  DuckDBSettings,
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

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
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

  const getSectionTitle = (section: string) => {
    if (section === 'dbt') return 'dbt™ Core';
    if (section === 'ai-providers') return 'AI Providers';
    if (section === 'profile') return 'Rosetta Cloud';
    if (section === 'duckdb') return 'DuckDB';
    return section.charAt(0).toUpperCase() + section.slice(1).replace('-', ' ');
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
      case 'profile':
        return <ProfileSettings />;
      case 'duckdb':
        return <DuckDBSettings />;
      case 'ai-providers':
        return <AIProvidersSettings />;
      case 'dbt':
        return (
          <DbtSettings
            settings={localSettings}
            onInstallDbtSave={handleChangeV2}
          />
        );
      case 'rosetta':
        return <RosettaSettings settings={localSettings} />;
      case 'about':
        return <AboutSettings />;
      default:
        return <Typography>Select a settings category</Typography>;
    }
  };

  return (
    <AppLayout
      sidebarContent={
        <Box
          sx={{
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            height: '100%',
          }}
        >
          <Box>
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
          {/* Theme Section */}
          <Box
            sx={{
              textAlign: 'left',
              borderTop: `1px solid ${theme.palette.divider}`,
              pt: 2,
            }}
          >
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Theme
            </Typography>
            <Button
              variant={mode === 'light' ? 'contained' : 'outlined'}
              size="small"
              onClick={() => setMode('light')}
              sx={{ mx: 0.5 }}
              startIcon={<LightMode fontSize="small" />}
            >
              Light
            </Button>
            <Button
              variant={mode === 'dark' ? 'contained' : 'outlined'}
              size="small"
              onClick={() => setMode('dark')}
              sx={{ mx: 0.5 }}
              startIcon={<DarkMode fontSize="small" />}
            >
              Dark
            </Button>
            <Button
              variant={mode === 'system' ? 'contained' : 'outlined'}
              size="small"
              onClick={() => setMode('system')}
              sx={{ mx: 0.5 }}
              startIcon={<AppsIcon fontSize="small" />}
            >
              System
            </Button>
          </Box>
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
              {getSectionTitle(currentSection)}
            </Title>
            <IconButton onClick={handleClose} edge="end" aria-label="close">
              <Close />
            </IconButton>
          </div>
          <div style={{ maxWidth: '100%' }}>{renderContent()}</div>
        </StyledForm>
      </Container>
    </AppLayout>
  );
};

export default Settings;
