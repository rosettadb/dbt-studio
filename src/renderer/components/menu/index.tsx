import React from 'react';
import {
  IconButton,
  Tooltip,
  useTheme,
  CircularProgress,
  Button,
} from '@mui/material';
import { OpenInNew } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { matchPath, useLocation } from 'react-router-dom';
import {
  IconsContainer,
  StyledToolbar,
  AuthButtonContent,
  AuthIcon,
  AuthLabel,
} from './styles';
import { icons, rosettaIcon } from '../../../../assets';
import { utils } from '../../helpers';
import { ROSETTA_CLOUD_BASE_URL } from '../../../main/utils/constants';
import {
  useGetSelectedProject,
  useProfile,
  useProfileSubscription,
  useApiKey,
  useAuthLogin,
  useAuthLogout,
  useAuthSubscription,
} from '../../controllers';
import { Icon } from '../icon';
import { useAppContext } from '../../hooks';
import { ExpandRightIcon } from '../sidebar/collapse-icons';
import { CommandPalette } from '../commandPalette';
import { CloudLocalEnvironmentSwitch } from './CloudLocalEnvironmentSwitch';
import { screens as screenRegistry } from '../../../extensionHost/renderer/contributions.renderer';
import { useRegistry } from '../../../extensionHost/renderer/registry.renderer';

type MenuProps = {
  actions?: React.ReactNode;
};

export const Menu: React.FC<MenuProps> = ({ actions }) => {
  const location = useLocation();
  const theme = useTheme();
  const { isChatOpen, setIsChatOpen, isSidebarOpen, setIsSidebarOpen } =
    useAppContext();

  // Auth hooks
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

  useAuthSubscription();
  useProfileSubscription();

  const { data: profile } = useProfile();

  const isAuthLoading = apiKeyLoading || loginLoading || logoutLoading;

  const handleAuthButtonClick = () => {
    login();
  };

  const { data: project } = useGetSelectedProject();

  const isProjectSelected = Boolean(project?.id);
  const isOnHome = location.pathname === '/app';
  const isOnProjectDetails = location.pathname === '/app/dbt-project';
  // Screens added through the screen registry say whether they have the
  // AI assistant.
  const registeredScreens = useRegistry(screenRegistry);
  const isOnAssistantScreen = registeredScreens.some(
    (screen) =>
      screen.assistant &&
      screen.paths.some((path) => matchPath(`/app/${path}`, location.pathname)),
  );

  // Home has no top bar: its search and cloud controls are in the Dashboard
  // header. The sign-in hooks above still run, so logging in from Home works.
  if (isOnHome) return null;

  return (
    <StyledToolbar variant="dense">
      <IconsContainer>
        {!isSidebarOpen &&
          location.pathname !== '/app' &&
          !location.pathname.includes('flows') && (
            <Tooltip title="Show panel">
              <IconButton
                size="small"
                onClick={() => setIsSidebarOpen(true)}
                sx={{
                  opacity: 0.5,
                  '&:hover': { opacity: 1 },
                }}
              >
                <ExpandRightIcon />
              </IconButton>
            </Tooltip>
          )}
      </IconsContainer>
      <IconsContainer sx={{ gap: 2 }}>
        <CommandPalette />
        {isProjectSelected && !isOnHome && actions}
        {/* Authentication - Only show when not logged in (on Home it's in the Dashboard header) */}
        {!isOnHome && !apiKey && (
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
                padding: '2px 8px',
                minWidth: 'auto',
                textTransform: 'none',
                height: '24px',
                fontSize: '0.7rem',
                '&:hover': {
                  borderColor: theme.palette.primary.main,
                },
                transition: 'all 0.2s ease',
              }}
            >
              {isAuthLoading ? (
                <CircularProgress size={12} />
              ) : (
                <AuthButtonContent>
                  <AuthIcon src={rosettaIcon} alt="Rosetta" />
                  <AuthLabel>Connect to Cloud</AuthLabel>
                </AuthButtonContent>
              )}
            </Button>
          </Tooltip>
        )}

        {/* Link to Rosetta Cloud Dashboard - Only show when logged in (on Home it's in the Dashboard header) */}
        {!isOnHome && apiKey && (
          <Tooltip
            title="Open Rosetta Cloud Dashboard"
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
                padding: '2px 8px',
                minWidth: 'auto',
                textTransform: 'none',
                height: '24px',
                fontSize: '0.7rem',
                '&:hover': {
                  borderColor: theme.palette.primary.main,
                },
                transition: 'all 0.2s ease',
              }}
            >
              <AuthButtonContent>
                <AuthIcon src={rosettaIcon} alt="Rosetta" />
                <AuthLabel>Cloud Dashboard</AuthLabel>
                <OpenInNew sx={{ fontSize: 14, opacity: 0.8 }} />
              </AuthButtonContent>
            </Button>
          </Tooltip>
        )}
        {profile && <CloudLocalEnvironmentSwitch />}
        {((isProjectSelected && isOnProjectDetails) || isOnAssistantScreen) && (
          <Tooltip title="AI Assistant (beta)">
            <IconButton
              onClick={() => setIsChatOpen?.(!isChatOpen)}
              color="primary"
            >
              <Icon
                src={icons.bot}
                width={22}
                height={22}
                color={theme.palette.primary.main}
              />
            </IconButton>
          </Tooltip>
        )}
      </IconsContainer>
    </StyledToolbar>
  );
};
