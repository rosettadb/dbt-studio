import React from 'react';
import SplitPane, { Pane } from 'split-pane-react';
import 'split-pane-react/esm/themes/default.css';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Search as SearchIcon, StorageOutlined } from '@mui/icons-material';
import { Badge, Box, Tab, Tabs } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  Loader,
  ProjectDbtSplitButton,
  TerminalLayout,
} from '../../components';
import {
  ProjectSidebar,
  SidebarTab,
} from '../../components/sidebar/project-sidebar';
import { Icon } from '../../components/icon';
import { icons } from '../../../../assets';
import { TabManager } from '../../components/editor/tabManager';
import { ActiveFileView } from '../../components/fileViews';
import {
  useGetFileStatuses,
  useGetSelectedProject,
  useGitIsInitialized,
} from '../../controllers';
import { useTabs } from '../../context/TabsProvider';
import { Content, EditorContainer, Header, NoFileSelected } from './styles';
import { useAppContext } from '../../hooks';
import { AppLayout } from '../../layouts';
import ChatScreen from '../chat';

const VerticalSash = (_: number, active: boolean) => (
  <div
    style={{
      width: '4px',
      height: '100%',
      cursor: 'col-resize',
      position: 'relative',
      backgroundColor: active ? 'rgba(144,202,249,0.4)' : 'transparent',
      transition: 'background-color 0.15s ease',
    }}
  >
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: 0,
        bottom: 0,
        width: '2px',
        transform: 'translateX(-50%)',
        backgroundColor: active
          ? 'rgba(144,202,249,0.8)'
          : 'rgba(255,255,255,0.08)',
        transition: 'background-color 0.15s ease',
      }}
    />
  </div>
);

// Minimum width for the chat panel — must be wide enough for the chat UI
const CHAT_MIN_WIDTH = 280;

// Layout only: sidebar strip, tab strip, the active file view, the bottom
// panels and the chat pane. Which component renders a file, and which panel
// a run lands in, are resolved by their registries from the stores — this
// screen does not know a pipeline from a SQL file.
const ProjectDetails: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const openCreatePipeline = React.useMemo(() => {
    const state = location.state as { openCreatePipeline?: boolean } | null;
    return state?.openCreatePipeline === true;
  }, []);

  // Clear the nav state so a back-navigation doesn't re-trigger the modal
  React.useEffect(() => {
    if (openCreatePipeline) {
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, []);

  const [verticalSizes, setVerticalSizes] = React.useState<(number | string)[]>(
    ['auto', 500],
  );
  const [sidebarTab, setSidebarTab] = React.useState<SidebarTab>('explorer');

  const { isChatOpen } = useAppContext();
  const { data: project, isLoading } = useGetSelectedProject();
  const { data: isInitialized } = useGitIsInitialized(project?.path, {
    enabled: !!project?.path,
  });
  const { data: statuses = [] } = useGetFileStatuses(project?.path, {
    enabled: !!project?.path && !!isInitialized,
  });
  const {
    tabs,
    activeTab,
    activeTabId,
    switchTab,
    closeTab,
    closeAll,
    saveAll,
    reorderTabs,
  } = useTabs();

  if (isLoading) {
    return <Loader />;
  }

  if (!project?.id) {
    return <Navigate to="/app/select-project" />;
  }

  const sidebarIconColor = (tab: SidebarTab) =>
    sidebarTab === tab
      ? theme.palette.primary.main
      : theme.palette.text.secondary;

  return (
    <AppLayout
      topMenuActions={<ProjectDbtSplitButton project={project} />}
      panelTitle="DBT Studio"
      sidebarContent={
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            bgcolor: 'background.paper',
          }}
        >
          <Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }}>
            <Tabs
              value={sidebarTab}
              onChange={(_e, newValue) => setSidebarTab(newValue)}
              variant="fullWidth"
              sx={{
                minHeight: 34,
                '& .MuiTab-root': {
                  minHeight: 34,
                  fontSize: '0.7rem',
                  textTransform: 'none',
                  py: 0,
                  minWidth: 0,
                  px: 0.5,
                },
                '& .MuiTab-iconWrapper': {
                  marginRight: '4px !important',
                  marginBottom: '0 !important',
                },
              }}
            >
              <Tab
                value="explorer"
                icon={
                  <Icon
                    src={icons.folder}
                    width={15}
                    height={15}
                    color={sidebarIconColor('explorer')}
                  />
                }
                iconPosition="start"
                label="Explorer"
              />
              <Tab
                value="search"
                icon={
                  <SearchIcon
                    sx={{ fontSize: 15, color: sidebarIconColor('search') }}
                  />
                }
                iconPosition="start"
                label="Search"
              />
              <Tab
                value="scm"
                icon={
                  <Badge
                    badgeContent={statuses.length}
                    color="primary"
                    max={99}
                    sx={{
                      '& .MuiBadge-badge': {
                        fontSize: 8,
                        height: 14,
                        minWidth: 14,
                        padding: '0 2px',
                        top: -2,
                        right: -6,
                      },
                    }}
                  >
                    <Icon
                      src={icons.gitBranch}
                      width={15}
                      height={15}
                      color={sidebarIconColor('scm')}
                    />
                  </Badge>
                }
                iconPosition="start"
                label="Git"
              />
              <Tab
                value="connections"
                icon={
                  <StorageOutlined
                    sx={{
                      fontSize: 15,
                      color: sidebarIconColor('connections'),
                    }}
                  />
                }
                iconPosition="start"
                label="Database"
              />
            </Tabs>
          </Box>
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            <ProjectSidebar
              activeTab={sidebarTab}
              project={project}
              openCreatePipeline={openCreatePipeline}
            />
          </Box>
        </Box>
      }
    >
      <SplitPane
        split="vertical"
        sizes={isChatOpen ? verticalSizes : ['100%', 0]}
        onChange={(newSizes) => {
          if (isChatOpen) {
            // Enforce minimum chat panel width
            const chatWidth = newSizes[1] as number;
            if (chatWidth < CHAT_MIN_WIDTH) {
              setVerticalSizes(['auto', CHAT_MIN_WIDTH]);
            } else {
              setVerticalSizes(newSizes);
            }
          }
        }}
        sashRender={VerticalSash}
      >
        <Pane minSize={200}>
          <Box height="100%" overflow="hidden">
            <TerminalLayout project={project}>
              <Content>
                <EditorContainer>
                  <Header>
                    <Box display="flex" flex={1} minWidth={0}>
                      <TabManager
                        tabs={tabs}
                        activeTabId={activeTabId}
                        onSelect={switchTab}
                        onClose={closeTab}
                        onCloseAll={closeAll}
                        onSaveAll={saveAll}
                        onReorder={reorderTabs}
                      />
                    </Box>
                  </Header>
                  <ActiveFileView
                    project={project}
                    emptyState={
                      !activeTab && (
                        <NoFileSelected>
                          Please select a file from the explorer on the left!
                        </NoFileSelected>
                      )
                    }
                  />
                </EditorContainer>
              </Content>
            </TerminalLayout>
          </Box>
        </Pane>
        <Pane minSize={CHAT_MIN_WIDTH}>
          <Box sx={{ height: '100%', overflow: 'hidden' }}>
            {isChatOpen && (
              <Box height="100%">
                <ChatScreen />
              </Box>
            )}
          </Box>
        </Pane>
      </SplitPane>
    </AppLayout>
  );
};

export default ProjectDetails;
