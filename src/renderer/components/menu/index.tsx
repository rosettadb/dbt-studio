import React from 'react';
import {
  IconButton,
  Tooltip,
  useTheme,
  CircularProgress,
  Button,
  Box,
} from '@mui/material';
import {
  ArrowDownward,
  Cloud,
  Computer,
  FormatListNumbered,
  OpenInNew,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  BranchDropdownToggle,
  IconsContainer,
  StyledToolbar,
  AuthButtonContent,
  AuthIcon,
  AuthLabel,
  EnvironmentSwitchContainer,
  EnvironmentSwitch,
  SwitchIcon,
} from './styles';
import { icons, rosettaIcon } from '../../../../assets';
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
  useGetSettings,
  useUpdateSettings,
} from '../../controllers';
import { SimpleDropdownMenu } from '../simpleDropdown';
import { Icon } from '../icon';
import { LetterAvatar } from '../letterAvatar';
import { useAppContext } from '../../hooks';
import { ExpandRightIcon } from '../sidebar/collapse-icons';

type MenuProps = {
  actions?: React.ReactNode;
};

export const Menu: React.FC<MenuProps> = ({ actions }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { mutateAsync: selectProject } = useSelectProject();
  const { data: settings } = useGetSettings();
  const { mutate: updateSettings } = useUpdateSettings();
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
  const { data: projects = [] } = useGetProjects();

  const isProjectSelected = Boolean(project?.id);
  const isOnProjectDetails = location.pathname === '/app';

  return (
    <StyledToolbar variant="dense">
      <IconsContainer>
        {!isSidebarOpen && (
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
        {isProjectSelected && (
          <SimpleDropdownMenu
            items={[
              {
                value: 'all',
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
                    <LetterAvatar name={p?.name ?? ''} size={16} />
                    {p?.name}
                  </BranchDropdownToggle>
                ),
              })),
            ]}
            onSelect={async (value) => {
              if (value === 'all') {
                navigate('/app/select-project');
              } else {
                await selectProject({ projectId: value });
                navigate('/app');
              }
            }}
            selectedItem={String(project?.id)}
            anchorElement={
              <BranchDropdownToggle>
                <LetterAvatar name={project?.name ?? ''} size={16} />
                {project?.name}
                <ArrowDownward style={{ fontSize: 9 }} />
              </BranchDropdownToggle>
            }
          />
        )}
      </IconsContainer>
      <IconsContainer sx={{ gap: 2 }}>
        {actions}
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

        {/* Link to Rosetta Cloud Dashboard - Only show when logged in */}
        {apiKey && (
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
        {profile && (
          <Box display="flex" gap={0.5}>
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
                        fontSize: 12,
                        color: theme.palette.primary.contrastText,
                      }}
                    />
                  ) : (
                    <Computer
                      sx={{
                        fontSize: 12,
                        color: theme.palette.primary.contrastText,
                      }}
                    />
                  )}
                </SwitchIcon>
              </EnvironmentSwitchContainer>
            </Tooltip>
            <span
              style={{
                fontSize: '12px',
                color: theme.palette.text.secondary,
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                height: '100%',
              }}
            >
              {settings?.env === 'cloud' ? 'Cloud' : 'Local'}
            </span>
          </Box>
        )}
        {((isProjectSelected && isOnProjectDetails) ||
          location.pathname === '/app/sql') && (
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
