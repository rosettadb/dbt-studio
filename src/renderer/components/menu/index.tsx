import React from 'react';
import { AppBar, IconButton, Tooltip, useTheme } from '@mui/material';
import {
  Settings,
  ArrowDownward,
  FormatListNumbered,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  BranchDropdownToggle,
  IconsContainer,
  Logo,
  StyledToolbar,
} from './styles';
import { icons, logo } from '../../../../assets';
import {
  useGetProjects,
  useGetSelectedProject,
  useSelectProject,
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
  const theme = useTheme();
  const { isSidebarOpen, setIsSidebarOpen, isChatOpen, setIsChatOpen } =
    useAppContext();

  const { data: project } = useGetSelectedProject();
  const { data: projects = [] } = useGetProjects();

  const isProjectSelected = Boolean(project?.id);
  const isSettingsActive = location.pathname.includes('/settings');
  const isOnProjectDetails = location.pathname === '/app';

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
    </AppBar>
  );
};
