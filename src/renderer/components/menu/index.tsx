import React from 'react';
import { IconButton, Tooltip, useTheme, Box } from '@mui/material';
import {
  ArrowDownward,
  Cloud,
  Computer,
  FormatListNumbered,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  BranchDropdownToggle,
  IconsContainer,
  StyledToolbar,
  EnvironmentSwitchContainer,
  EnvironmentSwitch,
  SwitchIcon,
} from './styles';
import { icons } from '../../../../assets';
import {
  useGetProjects,
  useGetSelectedProject,
  useSelectProject,
  useProfile,
  useGetSettings,
  useUpdateSettings,
} from '../../controllers';
import { SimpleDropdownMenu } from '../simpleDropdown';
import { CloudAuthButton } from '../cloudAuthButton';
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

  const { data: profile } = useProfile();

  const { data: project } = useGetSelectedProject();
  const { data: projects = [] } = useGetProjects();

  const isProjectSelected = Boolean(project?.id);
  const isOnHome = location.pathname === '/app';
  const isOnProjectDetails = location.pathname === '/app/dbt-project';

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
        {!isOnHome && (
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
                navigate('/app/dbt-project');
              }
            }}
            selectedItem={project ? String(project.id) : 'all'}
            anchorElement={
              <BranchDropdownToggle>
                {project ? (
                  <>
                    <LetterAvatar name={project.name ?? ''} size={16} />
                    {project.name}
                  </>
                ) : (
                  <>
                    <FormatListNumbered fontSize="small" />
                    Select Project
                  </>
                )}
                <ArrowDownward style={{ fontSize: 9 }} />
              </BranchDropdownToggle>
            }
          />
        )}
      </IconsContainer>
      <IconsContainer sx={{ gap: 2 }}>
        {isProjectSelected && !isOnHome && actions}
        <CloudAuthButton compact />
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
          location.pathname === '/app/sql' ||
          location.pathname.startsWith('/app/notebooks')) && (
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
