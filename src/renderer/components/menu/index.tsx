import React from 'react';
import {
  AppBar,
  IconButton,
  MenuItem,
  Tooltip,
  Menu as DD,
  useTheme,
  CircularProgress,
  Avatar,
} from '@mui/material';
import {
  Settings,
  ArrowDownward,
  FormatListNumbered,
  AccountCircle,
  Person,
  Logout,
  Cloud,
  Computer,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  BranchDropdownToggle,
  EnvironmentSwitch,
  EnvironmentSwitchContainer,
  IconsContainer,
  Logo,
  StyledToolbar,
  SwitchIcon,
} from './styles';
import { icons, logo } from '../../../../assets';
import {
  useGetBranches,
  useGetProjects,
  useGetRemotes,
  useGetSelectedProject,
  useGitCheckout,
  useGitInit,
  useGitIsInitialized,
  useGitPull,
  useGitPush,
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
import { AddGitRemoteModal, GitCommitModal, NewBranchModal } from '../modals';
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
  const [commitModal, setCommitModal] = React.useState(false);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [newBranchModal, setNewBranchModal] = React.useState(false);
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);

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
  const { mutate: logout, isLoading: logoutLoading } = useAuthLogout();

  // Subscribe to auth success events
  useAuthSubscription();

  // Subscribe to profile events
  useProfileSubscription();

  // Get profile data
  const { data: profile } = useProfile();

  const isAuthLoading = apiKeyLoading || loginLoading || logoutLoading;
  const [authMenuAnchor, setAuthMenuAnchor] =
    React.useState<null | HTMLElement>(null);

  const handleAuthMenuOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setAuthMenuAnchor(event.currentTarget);
  };

  const handleAuthMenuClose = () => {
    setAuthMenuAnchor(null);
  };

  const handleAuthButtonClick = (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    if (apiKey) {
      handleAuthMenuOpen(event);
      return;
    }

    login();
  };

  const { data: project } = useGetSelectedProject();
  const { data: projects = [] } = useGetProjects();
  const { data: isInitialized } = useGitIsInitialized(project?.path ?? '');
  const { data: remotes = [] } = useGetRemotes(project?.path ?? '');
  const { data: branches = [], refetch: updateBranches } = useGetBranches(
    project?.path ?? '',
  );

  const isProjectSelected = Boolean(project?.id);
  const isSettingsActive = location.pathname.includes('/settings');

  const { mutate: push } = useGitPush({
    onSuccess: (data) => {
      if (data.error) {
        toast.error(data.error);
        return;
      }
      if (data.authRequired) {
        toast.error('Not authorized! Please add your credentials!');
        return;
      }
      toast.info('Pushed to origin!');
    },
  });
  const { mutate: pull, isLoading: pulling } = useGitPull({
    onSuccess: (data) => {
      if (data.error) {
        toast.error(data.error);
        return;
      }
      if (data.authRequired) {
        toast.error('Not authorized! Please add your credentials!');
        return;
      }
      toast.info('Pulled from origin!');
    },
  });
  const { mutate: gitInit } = useGitInit({
    onSuccess: () => {
      toast.info('Git Initialized Successfully!');
      updateBranches();
    },
  });
  const { mutate: checkout } = useGitCheckout({
    onSuccess: async (_, variables) => {
      toast.info(`Checked out to ${variables.branch} branch!`);
      window.location.reload();
    },
  });

  const selectedBranch = React.useMemo(() => {
    return branches.find((branch) => branch.checkedOut)?.name ?? '';
  }, [branches]);

  const isOnProjectDetails = location.pathname === '/app';

  const handleMenuOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogoClick = () => {
    navigate('/app');
  };

  return (
    <AppBar position="fixed">
      <StyledToolbar variant="dense">
        <IconsContainer>
          <IconButton
            color="primary"
            aria-label="open drawer"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            edge="start"
          >
            {isSidebarOpen ? <CollapseLeftIcon /> : <ExpandRightIcon />}
          </IconButton>
          <Logo src={logo} alt="Rosetta Logo" onClick={handleLogoClick} />
          {isProjectSelected && (
            <SimpleDropdownMenu
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
          {isProjectSelected && isInitialized && branches.length > 0 && (
            <SimpleDropdownMenu
              items={[
                ...branches.map((branch) => ({
                  value: branch.name,
                  label: branch.name,
                })),
                { value: 'new', label: 'New branch' },
              ]}
              onSelect={(value) => {
                if (value === 'new') {
                  setNewBranchModal(true);
                  return;
                }
                checkout({
                  path: project?.path ?? '',
                  branch: value,
                });
              }}
              selectedItem={selectedBranch}
              anchorElement={
                <BranchDropdownToggle>
                  <Icon
                    src={icons.gitBranch}
                    color={theme.palette.text.primary}
                  />
                  {selectedBranch}
                  <ArrowDownward style={{ fontSize: 10 }} />
                </BranchDropdownToggle>
              }
            />
          )}
        </IconsContainer>
        <IconsContainer>
          {isProjectSelected && isOnProjectDetails && (
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
          {isProjectSelected && (
            <Tooltip title="Git Integration">
              <IconButton onClick={handleMenuOpen}>
                <Icon
                  src={icons.git}
                  color={
                    isInitialized
                      ? theme.palette.success.main
                      : theme.palette.error.main
                  }
                  width={22}
                  height={22}
                />
              </IconButton>
            </Tooltip>
          )}
          {isProjectSelected && (
            <DD
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={handleMenuClose}
            >
              {!isInitialized && (
                <MenuItem
                  onClick={() => {
                    if (!isInitialized && project?.path) {
                      gitInit({ path: project.path });
                    }
                  }}
                >
                  Enable Git
                </MenuItem>
              )}
              {isInitialized && (
                <>
                  <MenuItem
                    onClick={(event) => {
                      event.stopPropagation();
                      setCommitModal(true);
                    }}
                  >
                    Git Commit
                  </MenuItem>
                  <MenuItem
                    onClick={(event) => {
                      event.stopPropagation();
                      if (remotes.length === 0) {
                        toast.info('Please add remote origin!');
                        setIsModalOpen(true);
                        return;
                      }
                      if (project?.path) {
                        push({
                          path: project.path,
                        });
                      }
                    }}
                  >
                    Git Push
                  </MenuItem>
                  <MenuItem
                    disabled={pulling}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (remotes.length === 0) {
                        toast.info('Please add remote origin!');
                        setIsModalOpen(true);
                        return;
                      }
                      if (project?.path) {
                        pull({ path: project.path });
                      }
                    }}
                  >
                    Git Pull{' '}
                    {pulling && (
                      <CircularProgress size={18} style={{ marginLeft: 8 }} />
                    )}
                  </MenuItem>
                </>
              )}
            </DD>
          )}

          {/* Environment Switch */}
          {profile && (
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
                        color: theme.palette.primary.contrastText,
                      }}
                    />
                  ) : (
                    <Computer
                      sx={{
                        fontSize: 14,
                        color: theme.palette.primary.contrastText,
                      }}
                    />
                  )}
                </SwitchIcon>
              </EnvironmentSwitchContainer>
            </Tooltip>
          )}

          {/* Authentication Menu */}
          <Tooltip
            title={apiKey ? 'View profile options' : 'Login to Cloud Dashboard'}
          >
            <IconButton
              onClick={handleAuthButtonClick}
              disabled={isAuthLoading}
              color="primary"
              sx={{
                backgroundColor: apiKey
                  ? `${theme.palette.success.light}20`
                  : 'transparent',
                '&:hover': {
                  backgroundColor: apiKey
                    ? `${theme.palette.success.light}40`
                    : theme.palette.action.hover,
                },
                transition: 'background-color 0.2s ease',
              }}
            >
              {(() => {
                if (isAuthLoading) {
                  return <CircularProgress size={20} />;
                }
                if (apiKey) {
                  // Show user initials if profile data is available
                  if (profile?.name || profile?.email) {
                    const getInitials = (
                      name: string | null,
                      email: string,
                    ) => {
                      if (name) {
                        return name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .toUpperCase();
                      }
                      return email[0].toUpperCase();
                    };

                    return (
                      <Avatar
                        sx={{
                          width: 22,
                          height: 22,
                          fontSize: '0.75rem',
                        }}
                      >
                        {getInitials(profile.name, profile.email)}
                      </Avatar>
                    );
                  }
                  // Fallback to Person icon if no profile data
                  return (
                    <Person
                      sx={{ fontSize: 22, color: theme.palette.success.main }}
                    />
                  );
                }
                return <AccountCircle sx={{ fontSize: 22 }} />;
              })()}
            </IconButton>
          </Tooltip>
          {apiKey ? (
            <DD
              anchorEl={authMenuAnchor}
              open={Boolean(authMenuAnchor)}
              onClose={handleAuthMenuClose}
            >
              <MenuItem
                disabled
                sx={{ flexDirection: 'column', alignItems: 'flex-start' }}
              >
                <div style={{ fontWeight: 'bold', fontSize: '0.875rem' }}>
                  {profile?.name || 'User'}
                </div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: theme.palette.text.secondary,
                  }}
                >
                  {profile?.email}
                </div>
              </MenuItem>
              <MenuItem
                onClick={() => {
                  handleAuthMenuClose();
                  navigate('/app/settings/profile');
                }}
              >
                <Person fontSize="small" sx={{ mr: 1 }} /> Profile
              </MenuItem>
              <MenuItem
                onClick={() => {
                  handleAuthMenuClose();
                  logout();
                }}
              >
                <Logout fontSize="small" sx={{ mr: 1 }} /> Logout
              </MenuItem>
            </DD>
          ) : null}

          <Tooltip title="Settings">
            <IconButton
              aria-label="account of current user"
              aria-controls="menu-appbar"
              aria-haspopup="true"
              onClick={() => navigate('/app/settings')}
              color="primary"
              sx={{
                backgroundColor: isSettingsActive
                  ? theme.palette.divider
                  : 'transparent',
                '&:hover': {
                  backgroundColor: theme.palette.action.hover,
                },
                transition: 'background-color 0.2s ease',
              }}
            >
              <Settings sx={{ fontSize: 22 }} />
            </IconButton>
          </Tooltip>
        </IconsContainer>
      </StyledToolbar>
      {isModalOpen && project?.path && (
        <AddGitRemoteModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          path={project.path}
        />
      )}
      {commitModal && project?.path && (
        <GitCommitModal
          isOpen={commitModal}
          onClose={() => setCommitModal(false)}
          path={project.path}
        />
      )}
      {newBranchModal && project?.path && (
        <NewBranchModal
          isOpen={newBranchModal}
          onClose={() => setNewBranchModal(false)}
          path={project.path}
        />
      )}
    </AppBar>
  );
};
