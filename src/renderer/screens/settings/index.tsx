import React from 'react';
import { toast } from 'react-toastify';
import {
  Typography,
  Box,
  List,
  ListItem,
  useTheme,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import { OpenInNew } from '@mui/icons-material';
import { useLocation } from 'react-router-dom';
import { SettingsType } from '../../../types/backend';
import {
  useFilePicker,
  useGetSettings,
  useUpdateSettings,
} from '../../controllers';
import {
  Container,
  StyledForm,
  StyledSettingsNavLink,
  Title,
  Description,
} from './styles';
import {
  GeneralSettings,
  ProfileSettings,
  DbtSettings,
  PythonSettings,
  RosettaSettings,
  RunnerSettings,
  AboutSettings,
  AIProvidersSettings,
  DuckDBSettings,
  FlowfileSettings,
  KeystoreSettings,
  TaskManagerSettings,
  BackupSettings,
} from '../../components';
import { AppLayout } from '../../layouts';
import { settingsSidebarCategories } from './settingsElements';

const Settings: React.FC = () => {
  const theme = useTheme();
  const { data: settings } = useGetSettings();
  const { mutate: updateSettings, mutateAsync: updateSettingsAsync } =
    useUpdateSettings({
      onSuccess: () => {
        toast.success('Settings successfully updated!');
      },
    });
  const { mutate: getFiles } = useFilePicker();
  const location = useLocation();
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

  // Mirrors localSettings synchronously so back-to-back handleChangeV2 calls
  // (e.g. saving dbtPath then dbtVersion right after an install) each build
  // on the other's update instead of racing against stale React state.
  const localSettingsRef = React.useRef<SettingsType>(localSettings);

  React.useEffect(() => {
    localSettingsRef.current = localSettings;
  }, [localSettings]);

  const handleChangeV2 = async (name: string, value: string) => {
    const previousSettings = localSettingsRef.current;
    const newSettings = { ...previousSettings, [name]: value };
    localSettingsRef.current = newSettings;
    setLocalSettings(newSettings);
    try {
      await updateSettingsAsync(newSettings);
    } catch (error) {
      localSettingsRef.current = previousSettings;
      setLocalSettings(previousSettings);
      toast.error(
        error instanceof Error ? error.message : 'Failed to save settings',
      );
      throw error;
    }
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

  const getSectionTitle = (section: string) => {
    if (section === 'dbt') return 'dbt™ Core';
    if (section === 'python') return 'Python';
    if (section === 'ai-providers') return 'AI Settings';
    if (section === 'profile') return 'Rosetta Cloud';
    if (section === 'duckdb') return 'DuckDB';
    if (section === 'flowfile') return 'Flowfile';
    if (section === 'runner') return 'Local Runner';
    if (section === 'keystore') return 'Keystore';
    if (section === 'task-manager') return 'Task Manager';
    if (section === 'backup') return 'Backup & Restore';
    return section.charAt(0).toUpperCase() + section.slice(1).replace('-', ' ');
  };

  const sectionDescriptions: Record<string, string> = {
    general:
      'Where projects live, how the app looks, and which version you run.',
    'ai-providers': 'Providers, tools and how the AI assistant behaves.',
    profile: 'Connect to Rosetta Cloud and view your profile.',
    keystore:
      'Credentials stored in the system keystore, grouped by environment.',
    'task-manager': 'Track and cancel long-running background tasks.',
    backup: 'Export your app data to a ZIP and restore it later.',
    dbt: 'dbt runtimes, adapters and packages used to build your projects.',
    python:
      'Embedded interpreter used by dbt Core, Flowfile and column lineage.',
    rosetta: 'Rosetta CLI versions and installation.',
    duckdb: 'Local DuckDB instance used for caching, data preview and storage.',
    flowfile: 'Install and manage Flowfile.',
    runner: 'Run pipelines on this machine and manage their tool dependencies.',
    about: 'Version, help links and advanced options.',
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
      case 'python':
        return <PythonSettings settings={localSettings} />;
      case 'rosetta':
        return <RosettaSettings settings={localSettings} />;
      case 'runner':
        return <RunnerSettings settings={localSettings} />;
      case 'flowfile':
        return (
          <FlowfileSettings
            settings={localSettings}
            onSettingsChange={handleChangeV2}
          />
        );
      case 'keystore':
        return <KeystoreSettings />;
      case 'task-manager':
        return <TaskManagerSettings />;
      case 'backup':
        return <BackupSettings />;
      case 'about':
        return <AboutSettings />;
      default:
        return <Typography>Select a settings category</Typography>;
    }
  };

  return (
    <AppLayout
      panelTitle="Settings"
      sidebarContent={
        <Box
          sx={{
            p: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            height: '100%',
          }}
        >
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              overflowX: 'hidden',
              overflowY: 'auto',
            }}
          >
            <List
              sx={{
                py: 0,
                width: '100%',
                '& .MuiListItem-root': {
                  py: 0,
                  px: 1,
                  minHeight: '28px',
                  width: '100%',
                },
                '& .MuiListItemText-primary': { fontSize: 13 },
              }}
            >
              {settingsSidebarCategories.map((category, categoryIndex) => (
                <React.Fragment key={category.label || `cat-${categoryIndex}`}>
                  {categoryIndex > 0 && (
                    <Box
                      sx={{
                        borderTop: `1px solid ${theme.palette.divider}`,
                        my: 1,
                      }}
                    />
                  )}
                  {category.label && (
                    <Typography
                      variant="caption"
                      sx={{
                        px: 1,
                        py: 0.5,
                        display: 'block',
                        color: theme.palette.text.secondary,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        fontSize: '0.65rem',
                      }}
                    >
                      {category.label}
                    </Typography>
                  )}
                  {category.items.map((element) => (
                    <StyledSettingsNavLink key={element.text} to={element.path}>
                      <ListItem
                        onClick={
                          element.externalUrl
                            ? (e) => {
                                e.preventDefault();
                                window.open(
                                  element.externalUrl,
                                  '_blank',
                                  'noopener,noreferrer',
                                );
                              }
                            : undefined
                        }
                        sx={{
                          cursor: 'pointer',
                          borderRadius: 1,
                          mb: 0,
                          width: '100%',
                          backgroundColor:
                            !element.externalUrl &&
                            location.pathname === element.path
                              ? theme.palette.divider
                              : 'transparent',
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 28 }}>
                          <element.icon
                            fontSize="small"
                            color={
                              !element.externalUrl &&
                              location.pathname === element.path
                                ? 'primary'
                                : 'inherit'
                            }
                          />
                        </ListItemIcon>
                        <ListItemText primary={element.text} />
                        {element.externalUrl && (
                          <OpenInNew
                            sx={{ fontSize: 13, opacity: 0.4, mr: 2 }}
                          />
                        )}
                      </ListItem>
                    </StyledSettingsNavLink>
                  ))}
                </React.Fragment>
              ))}
            </List>
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
          <div>
            <Title>{getSectionTitle(currentSection)}</Title>
            {sectionDescriptions[currentSection] && (
              <Description>{sectionDescriptions[currentSection]}</Description>
            )}
          </div>
          <div style={{ maxWidth: 820 }}>{renderContent()}</div>
        </StyledForm>
      </Container>
    </AppLayout>
  );
};

export default Settings;
