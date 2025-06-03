import React from 'react';
import {
  AppBar,
  IconButton,
  MenuItem,
  Tooltip,
  Menu as DD,
  useTheme,
  CircularProgress,
} from '@mui/material';
import { Menu as MenuIcon, Settings, ArrowDownward } from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  BranchDropdownToggle,
  IconsContainer,
  Logo,
  StyledToolbar,
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
} from '../../controllers';
import { AddGitRemoteModal, GitCommitModal, NewBranchModal } from '../modals';
import { SimpleDropdownMenu } from '../simpleDropdown';
import { Icon } from '../icon';
import { projectsServices } from '../../services';
import { LetterAvatar } from '../letterAvatar';
import { useAppContext } from '../../hooks';

export const Menu: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const { isSidebarOpen, setIsSidebarOpen } = useAppContext();
  const [commitModal, setCommitModal] = React.useState(false);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [newBranchModal, setNewBranchModal] = React.useState(false);
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);

  const { data: project } = useGetSelectedProject();
  const { data: projects = [] } = useGetProjects();
  const { data: isInitialized } = useGitIsInitialized(project?.path ?? '');
  const { data: remotes = [] } = useGetRemotes(project?.path ?? '');
  const { data: branches = [], refetch: updateBranches } = useGetBranches(
    project?.path ?? '',
  );

  // Conditional logic for project state
  const isProjectSelected = Boolean(project?.id);
  const isProjectFullyConfigured = Boolean(project?.id && project?.dbtConnection);

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
            color="default"
            aria-label="open drawer"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            edge="start"
            disabled={!isProjectSelected}
            sx={{
              opacity: isProjectSelected ? 1 : 0.5,
              cursor: isProjectSelected ? 'pointer' : 'not-allowed'
            }}
          >
            <MenuIcon />
          </IconButton>
          <Logo src={logo} alt="Rosetta Logo" onClick={handleLogoClick} />
          {isProjectSelected && (
            <SimpleDropdownMenu
              items={[
                ...projects.map((p) => ({
                  value: String(p.id),
                  label: (
                    <BranchDropdownToggle>
                      <LetterAvatar name={p?.name ?? ''} size={18} />
                      {p?.name}
                    </BranchDropdownToggle>
                  ),
                })),
                { value: 'new', label: 'New Project' },
              ]}
              onSelect={async (value) => {
                if (value === 'new') {
                  await projectsServices.selectProject({ projectId: '' });
                  navigate('/app/select-project');
                } else {
                  await projectsServices.selectProject({ projectId: value });
                  if (location.pathname === '/app' || location.pathname === '/app/') {
                    navigate('/app/settings/general');
                    setTimeout(() => navigate('/app'), 0);
                  } else {
                    navigate('/app');
                  }
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
          <IconButton
            aria-label="account of current user"
            aria-controls="menu-appbar"
            aria-haspopup="true"
            onClick={() => navigate('/app/settings')}
            color="primary"
          >
            <Settings fontSize="small" />
          </IconButton>
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
