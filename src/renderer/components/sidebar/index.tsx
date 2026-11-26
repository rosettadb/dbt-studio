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
import { useNavigationItems, type SidebarItem } from './elements';
import { isNavigationItemActive } from '../../../extensionHost/renderer/contributions.renderer';
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

const useNoTargetPath = (): string | undefined => undefined;

type SidebarNavItemProps = {
  element: SidebarItem;
  isActive: boolean;
  isBarExpanded: boolean;
};

// One activity-bar entry. A component of its own so an item's
// `useTargetPath` hook runs in a stable place.
const SidebarNavItem: React.FC<SidebarNavItemProps> = ({
  element,
  isActive,
  isBarExpanded,
}) => {
  const theme = useTheme();
  const isDisabled = element.disabled;
  // An item can supply a hook for where it opens (the data lake reopens the
  // page that was open last); otherwise it opens its own path.
  const useTargetPath = element.useTargetPath ?? useNoTargetPath;
  const targetPath = useTargetPath() ?? element.path;

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
        py: 0,
        minHeight: 48,
        // 6px left keeps the expanded icon centre (~28px) where it sits in the collapsed bar
        pl: isBarExpanded ? 0.75 : 0,
        pr: isBarExpanded ? 1 : 0,
        justifyContent: isBarExpanded ? undefined : 'center',
      }}
    >
      <ListItemIcon
        sx={{
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          opacity: isDisabled ? 0.5 : 1,
          minWidth: isBarExpanded ? 44 : 0,
          width: isBarExpanded ? 44 : undefined,
          justifyContent: 'center',
          '& > *': { transform: 'scale(1.08)' },
        }}
      >
        <element.icon />
      </ListItemIcon>
      {isBarExpanded && (
        <ListItemText
          primary={element.label}
          primaryTypographyProps={{
            fontSize: 13,
            noWrap: true,
          }}
        />
      )}
    </ListItem>
  );

  const wrapped = (
    <StyledNavLink
      to={targetPath}
      data-testid={element.testId}
      style={{
        cursor: 'pointer',
        pointerEvents: isDisabled ? 'none' : 'auto',
      }}
    >
      {listItem}
    </StyledNavLink>
  );

  if (isBarExpanded) {
    return wrapped;
  }

  return (
    <Tooltip title={element.label} placement="right" arrow>
      {wrapped}
    </Tooltip>
  );
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

  const { main: mainElements, bottom: bottomElements } =
    useNavigationItems(isProjectSelected);

  const activityBarWidth = isBarExpanded
    ? ACTIVITY_BAR_EXPANDED_WIDTH
    : ACTIVITY_BAR_COLLAPSED_WIDTH;

  const isPanelOpen = Boolean(content) && isSidebarOpen;

  // Auto-collapse sidebar panel when on Home (/app) and auto-expand when navigating to any module
  React.useEffect(() => {
    if (location.pathname === '/app') {
      setIsSidebarOpen(false);
    } else {
      setIsSidebarOpen(true);
    }
    setIsBarExpanded(false);
  }, [location.pathname, setIsSidebarOpen]);

  return (
    <StyledDrawer
      variant="permanent"
      open={isPanelOpen}
      activityBarWidth={activityBarWidth}
      data-testid="sidebar"
      data-tour="tour-sidebar-nav"
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
                style={{ width: 22, height: 22 }}
              />
            </Box>
          )}
        </ActivityBarHeader>

        {/* Main items */}
        <Box sx={{ flex: 1 }}>
          <List sx={{ width: '100%', pt: 0.5 }}>
            {mainElements.map((el) => (
              <SidebarNavItem
                key={el.id}
                element={el}
                isActive={isNavigationItemActive(el, location.pathname)}
                isBarExpanded={isBarExpanded}
              />
            ))}
          </List>
        </Box>

        <List sx={{ width: '100%', pb: 0.5 }}>
          {bottomElements.map((el) => (
            <SidebarNavItem
              key={el.id}
              element={el}
              isActive={isNavigationItemActive(el, location.pathname)}
              isBarExpanded={isBarExpanded}
            />
          ))}
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
                  // Lets a long picker name shrink to an ellipsis
                  flex: 1,
                  minWidth: 0,
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
                sx={{
                  ml: 'auto',
                  flexShrink: 0,
                  opacity: 0.6,
                  '&:hover': { opacity: 1 },
                }}
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
