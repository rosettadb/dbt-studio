import React from 'react';
import {
  AppBar,
  IconButton,
  Tooltip,
  useTheme,
  CircularProgress,
  Button,
} from '@mui/material';
import {
  ArrowDownward,
  FormatListNumbered,
  Cloud,
  Computer,
  OpenInNew,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  BranchDropdownToggle,
  EnvironmentSwitch,
  EnvironmentSwitchContainer,
  IconsContainer,
  Logo,
  StyledToolbar,
  SwitchIcon,
  AuthButtonContent,
  AuthIcon,
  AuthLabel,
} from './styles';
import { icons, logo, logoLight, rosettaIcon } from '../../../../assets';
import { utils } from '../../helpers';
import { ROSETTA_CLOUD_BASE_URL } from '../../../main/utils/constants';
import {
  useGetProjects,
  useGetSelectedProject,
  useSelectProject,
  useProfile,
  useProfileSubscription,
  useApiKey,
  useAuthLogin,
  useAuthLogout,
  useAuthSubscription,
  useUpdateSettings,
  useGetSettings,
} from '../../controllers';
import { SimpleDropdownMenu } from '../simpleDropdown';
import { Icon } from '../icon';
import { LetterAvatar } from '../letterAvatar';
import { useAppContext } from '../../hooks';
import { CollapseLeftIcon, ExpandRightIcon } from './collapse-icons';

export const Menu: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { mutateAsync: selectProject } = useSelectProject();
  const { data: settings } = useGetSettings();
  const { mutate: updateSettings } = useUpdateSettings();
  const theme = useTheme();
  const { isSidebarOpen, setIsSidebarOpen, isChatOpen, setIsChatOpen } =
    useAppContext();

  // Auth hooks - Updated to use API key
  const { data: apiKey, isLoading: apiKeyLoading } = useApiKey();
  const { mutate: login, isLoading: loginLoading } = useAuthLogin({
    onSuccess: () => {
      toast.success(
        'Login initiated! Please complete authentication in your browser.',
      );
    },
    onError: (error) => {
      toast.error(`Login failed: ${error.message || 'Unknown error'}`);
    },
  });
  const { isLoading: logoutLoading } = useAuthLogout();

  // Subscribe to auth success events
  useAuthSubscription();

  // Subscribe to profile events
  useProfileSubscription();

  // Get profile data
  const { data: profile } = useProfile();

  const isAuthLoading = apiKeyLoading || loginLoading || logoutLoading;

  const handleAuthButtonClick = () => {
    login();
  };

  const { data: project } = useGetSelectedProject();
  const { data: projects = [] } = useGetProjects();

  const isProjectSelected = Boolean(project?.id);

  const isOnProjectDetails = location.pathname === '/app';

  const isLightMode = theme.palette.mode === 'light';
  const headerIconColor = isLightMode
    ? theme.palette.primary.contrastText
    : theme.palette.primary.main;
  const headerTextColor = isLightMode
    ? theme.palette.primary.contrastText
    : theme.palette.text.secondary;

  const handleLogoClick = () => {
    navigate('/app');
  };

  return (
    <AppBar position="fixed">
      <StyledToolbar variant="dense">
        <IconsContainer>
          <IconButton
            aria-label="open drawer"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            edge="start"
            sx={{ color: headerIconColor }}
          >
            {isSidebarOpen ? <CollapseLeftIcon /> : <ExpandRightIcon />}
          </IconButton>
          <Logo
            src={isLightMode ? logoLight : logo}
            alt="Rosetta Logo"
            onClick={handleLogoClick}
          />
          {isProjectSelected && (
            <SimpleDropdownMenu
              buttonSx={
                isLightMode
                  ? { color: theme.palette.primary.contrastText }
                  : undefined
              }
              items={[
                {
                  value: 'new',
                  label: (
                    <BranchDropdownToggle>
                      <FormatListNumbered fontSize="small" />
                      All Projects
                    </BranchDropdownToggle>
                  ),
                },
                ...projects.map((p) => ({
                  value: String(p.id),
                  label: (
                    <BranchDropdownToggle>
                      <LetterAvatar name={p?.name ?? ''} size={18} />
                      {p?.name}
                    </BranchDropdownToggle>
                  ),
                })),
              ]}
              onSelect={async (value) => {
                if (value === 'new') {
                  await selectProject({ projectId: '' });
                  navigate('/app/select-project');
                } else {
                  await selectProject({ projectId: value });
                  navigate('/app');
                }
              }}
              selectedItem={String(project?.id)}
              anchorElement={
                <BranchDropdownToggle>
                  <LetterAvatar name={project?.name ?? ''} size={18} />
                  {project?.name}
                  <ArrowDownward style={{ fontSize: 10 }} />
                </BranchDropdownToggle>
              }
            />
          )}
        </IconsContainer>
        <IconsContainer sx={{ gap: 1 }}>
          {/* Authentication - Only show when not logged in */}
          {!apiKey && (
            <Tooltip
              title="Run your DBT Studio pipelines on Google Cloud Run, AWS, or Azure with ease."
              enterDelay={800}
              enterNextDelay={800}
            >
              <Button
                onClick={handleAuthButtonClick}
                disabled={isAuthLoading}
                variant="outlined"
                size="small"
                sx={{
                  borderRadius: '4px',
                  padding: '4px 8px',
                  minWidth: 'auto',
                  textTransform: 'none',
                  height: '28px',
                  borderColor: headerIconColor,
                  color: headerIconColor,
                  '&:hover': {
                    borderColor: headerIconColor,
                    bgcolor: 'rgba(255,255,255,0.1)',
                  },
                  transition: 'all 0.2s ease',
                }}
              >
                {isAuthLoading ? (
                  <CircularProgress size={14} />
                ) : (
                  <AuthButtonContent>
                    <AuthIcon src={rosettaIcon} alt="Rosetta" />
                    <AuthLabel>Connect to Rosetta Cloud</AuthLabel>
                  </AuthButtonContent>
                )}
              </Button>
            </Tooltip>
          )}

          {/* Link to Rosetta Cloud Dashboard - Only show when logged in */}
          {apiKey && (
            <Tooltip
              title="Open Rosetta Cloud Dashboard in your browser"
              enterDelay={800}
              enterNextDelay={800}
            >
              <Button
                onClick={(e) => {
                  utils.handleExternalLink(
                    e as any,
                    `${ROSETTA_CLOUD_BASE_URL}/dashboard`,
                  );
                }}
                variant="outlined"
                size="small"
                sx={{
                  borderRadius: '4px',
                  padding: '4px 8px',
                  minWidth: 'auto',
                  textTransform: 'none',
                  height: '28px',
                  borderColor: headerIconColor,
                  color: headerIconColor,
                  '&:hover': {
                    borderColor: headerIconColor,
                    bgcolor: 'rgba(255,255,255,0.1)',
                  },
                  transition: 'all 0.2s ease',
                }}
              >
                <AuthButtonContent>
                  <AuthIcon src={rosettaIcon} alt="Rosetta" />
                  <AuthLabel>Cloud Dashboard</AuthLabel>
                  <OpenInNew
                    sx={{ fontSize: 14, opacity: 0.8, color: headerIconColor }}
                  />
                </AuthButtonContent>
              </Button>
            </Tooltip>
          )}

          {/* Environment Switch */}
          {profile && (
            <>
              <Tooltip
                title={`Switch to ${settings?.env === 'cloud' ? 'Local' : 'Cloud'} Environment`}
              >
                <EnvironmentSwitchContainer>
                  <EnvironmentSwitch
                    checked={settings?.env === 'cloud'}
                    onChange={(event) => {
                      const newEnv = event.target.checked ? 'cloud' : 'local';
                      updateSettings({
                        ...settings!,
                        env: newEnv,
                      });
                      toast.info(
                        `Switched to ${newEnv === 'cloud' ? 'Cloud' : 'Local'} environment`,
                      );
                    }}
                    inputProps={{ 'aria-label': 'Environment switcher' }}
                  />
                  <SwitchIcon
                    className={
                      settings?.env === 'cloud' ? 'checked' : 'unchecked'
                    }
                  >
                    {settings?.env === 'cloud' ? (
                      <Cloud
                        sx={{
                          fontSize: 14,
                          color: isLightMode
                            ? theme.palette.primary.main
                            : theme.palette.primary.contrastText,
                        }}
                      />
                    ) : (
                      <Computer
                        sx={{
                          fontSize: 14,
                          color: isLightMode
                            ? theme.palette.primary.main
                            : theme.palette.primary.contrastText,
                        }}
                      />
                    )}
                  </SwitchIcon>
                </EnvironmentSwitchContainer>
              </Tooltip>
              <span
                style={{
                  fontSize: '12px',
                  color: headerTextColor,
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  height: '100%',
                }}
              >
                {settings?.env === 'cloud' ? 'Cloud' : 'Local'}
              </span>
            </>
          )}

          {isProjectSelected && isOnProjectDetails && (
            <Tooltip title="AI Assistant (beta)">
              <IconButton
                onClick={() => setIsChatOpen?.(!isChatOpen)}
                sx={{ color: headerIconColor }}
              >
                <Icon
                  src={icons.bot}
                  width={22}
                  height={22}
                  color={headerIconColor}
                />
              </IconButton>
            </Tooltip>
          )}
        </IconsContainer>
      </StyledToolbar>
    </AppBar>
  );
};
