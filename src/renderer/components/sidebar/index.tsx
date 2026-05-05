import React from 'react';
import {
  Box,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useLocation } from 'react-router-dom';
import { CollapseLeftIcon } from './collapse-icons';
import { getMainElements, getBottomElements } from './elements';
import {
  ACTIVITY_BAR_COLLAPSED_WIDTH,
  ACTIVITY_BAR_EXPANDED_WIDTH,
  ActivityBar,
  ActivityBarHeader,
  SidebarContent,
  SidebarPanelHeader,
  StyledDrawer,
  StyledNavLink,
} from './styles';
import { useAppContext } from '../../hooks';
import { useGetSelectedProject } from '../../controllers';
import { logo, rosettaIcon } from '../../../../assets';

type Props = {
  content?: React.ReactNode;
  panelHeaderLeft?: React.ReactNode;
  panelTitle?: string;
};

export const Sidebar: React.FC<Props> = ({
  content,
  panelHeaderLeft,
  panelTitle,
}) => {
  const theme = useTheme();
  const { data: selectedProject } = useGetSelectedProject();
  const { isSidebarOpen, setIsSidebarOpen } = useAppContext();
  const location = useLocation();

  const [isBarExpanded, setIsBarExpanded] = React.useState(false);

  const isProjectSelected = Boolean(selectedProject?.id);

  const activeItemPath = React.useMemo(() => {
    const path = location.pathname;
    if (path.includes('cloud-explorer')) return '/app/cloud-explorer';
    if (path.includes('data-lake') || path.includes('datalake'))
      return '/app/data-lake';
    if (path.includes('connection')) return '/app/connections';
    if (path.includes('select-project')) return '/app/select-project';
    if (path.includes('notebooks')) return '/app/notebooks';
    if (path.includes('sql')) return '/app/sql';
    if (path.includes('settings')) return '/app/settings';
    if (path === '/app') return '/app';
    return '';
  }, [location.pathname]);

  const mainElements = getMainElements(isProjectSelected);
  const bottomElements = getBottomElements();

  const activityBarWidth = isBarExpanded
    ? ACTIVITY_BAR_EXPANDED_WIDTH
    : ACTIVITY_BAR_COLLAPSED_WIDTH;

  const isPanelOpen = Boolean(content) && isSidebarOpen;

  const renderItem = (element: (typeof mainElements)[0], isActive: boolean) => {
    const isDisabled = element.disabled;

    const listItem = (
      <ListItem
        sx={{
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          m: 0,
          opacity: isDisabled ? 0.5 : 1,
          backgroundColor: isActive ? theme.palette.divider : 'transparent',
          '&:hover': {
            backgroundColor: isDisabled
              ? 'transparent'
              : theme.palette.action.hover,
          },
          transition: 'all 0.2s ease',
          pointerEvents: isDisabled ? 'none' : 'auto',
          px: isBarExpanded ? 2 : undefined,
        }}
      >
        <ListItemIcon
          sx={{
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            opacity: isDisabled ? 0.5 : 1,
            minWidth: isBarExpanded ? 36 : undefined,
          }}
        >
          <element.icon />
        </ListItemIcon>
        {isBarExpanded && (
          <ListItemText
            primary={element.text}
            primaryTypographyProps={{
              fontSize: '0.8rem',
              noWrap: true,
            }}
          />
        )}
      </ListItem>
    );

    const wrapped = (
      <StyledNavLink
        to={element.path}
        data-testid={element.testId}
        style={{
          cursor: 'pointer',
          pointerEvents: isDisabled ? 'none' : 'auto',
        }}
        onClick={(e) => {
          if (isActive) {
            // Clicking the already-active item toggles the panel closed
            e.preventDefault();
            setIsSidebarOpen(!isSidebarOpen);
          } else {
            // Navigating to a different page always opens the panel
            setIsSidebarOpen(true);
          }
        }}
      >
        {listItem}
      </StyledNavLink>
    );

    if (isBarExpanded) {
      return <React.Fragment key={element.text}>{wrapped}</React.Fragment>;
    }

    return (
      <Tooltip key={element.text} title={element.text} placement="right" arrow>
        {wrapped}
      </Tooltip>
    );
  };

  return (
    <StyledDrawer
      variant="permanent"
      open={isPanelOpen}
      activityBarWidth={activityBarWidth}
      data-testid="sidebar"
    >
      <ActivityBar expanded={isBarExpanded}>
        <ActivityBarHeader>
          {isBarExpanded ? (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                px: 1,
              }}
            >
              <img
                src={logo}
                alt="Logo"
                style={{ height: 32, objectFit: 'contain', marginTop: 4 }}
              />
              <IconButton
                size="small"
                onClick={() => setIsBarExpanded(false)}
                sx={{ opacity: 0.6, '&:hover': { opacity: 1 } }}
              >
                <CollapseLeftIcon />
              </IconButton>
            </Box>
          ) : (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                gap: 0.25,
                cursor: 'pointer',
                height: '100%',
                '&:hover': { backgroundColor: theme.palette.action.hover },
                transition: 'background-color 0.15s ease',
              }}
              onClick={() => setIsBarExpanded(true)}
            >
              <img
                src={rosettaIcon}
                alt="Icon"
                style={{ width: 20, height: 20 }}
              />
            </Box>
          )}
        </ActivityBarHeader>

        {/* Main items */}
        <Box sx={{ flex: 1 }}>
          <List sx={{ width: activityBarWidth, pt: 0.5 }}>
            {mainElements.map((el) =>
              renderItem(el, activeItemPath === el.path),
            )}
          </List>
        </Box>

        <List sx={{ width: activityBarWidth, pb: 0.5 }}>
          {bottomElements.map((el) =>
            renderItem(el, activeItemPath === el.path),
          )}
        </List>
      </ActivityBar>

      {content && (
        <SidebarContent open={isPanelOpen}>
          <SidebarPanelHeader>
            {panelHeaderLeft && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  ml: 0.5,
                }}
              >
                {panelHeaderLeft}
              </Box>
            )}
            {!panelHeaderLeft && panelTitle && (
              <Box
                sx={{
                  ml: 1.5,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: theme.palette.text.secondary,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {panelTitle}
              </Box>
            )}
            <Tooltip title="Close panel" placement="bottom" arrow>
              <IconButton
                size="small"
                onClick={() => setIsSidebarOpen(false)}
                sx={{ ml: 'auto', opacity: 0.6, '&:hover': { opacity: 1 } }}
              >
                <CollapseLeftIcon />
              </IconButton>
            </Tooltip>
          </SidebarPanelHeader>
          <Box sx={{ flex: 1, overflow: 'hidden' }}>{content}</Box>
        </SidebarContent>
      )}
    </StyledDrawer>
  );
};
