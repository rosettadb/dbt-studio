import React from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import CloseIcon from '@mui/icons-material/Close';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { connectionIcon } from '../../../connections/registry.renderer';
import { SqlTabId, SqlTabState } from '../../../types/editor';
import { TabContextMenu } from '../tabContextMenu';
import { copyText } from '../../lib/clipboard';
import {
  SqlTabBar,
  TabsContainer,
  DropIndicator,
  SqlTabButton,
  TabTitle,
  TabIcon,
  LoadingDot,
  EmptyTabsPlaceholder,
} from './styles';

interface SqlTabProps {
  tab: SqlTabState;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
}

const SqlTab: React.FC<SqlTabProps> = ({
  tab,
  isActive,
  onSelect,
  onClose,
  onContextMenu,
}) => {
  const handleClose = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onClose();
  };

  // Get connection type icon
  const icon = connectionIcon(tab.connectionType);

  const tooltipText = `${tab.connectionName} (${tab.connectionType})`;

  return (
    <Tooltip
      title={tooltipText}
      arrow
      placement="bottom"
      enterDelay={600}
      enterNextDelay={600}
    >
      <SqlTabButton
        active={isActive}
        onClick={onSelect}
        onContextMenu={(e) => {
          if (onContextMenu) {
            e.preventDefault();
            onContextMenu(e);
          }
        }}
        onAuxClick={(e) => {
          if (e.button === 1) {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
        role="tab"
        tabIndex={0}
        aria-selected={isActive}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault(); // Prevent scrolling on Space
            onSelect();
          }
        }}
      >
        {tab.isLoading && <LoadingDot />}
        {!tab.isLoading && tab.error && (
          <Tooltip
            title={tab.error}
            arrow
            placement="bottom"
            enterDelay={300}
            enterNextDelay={300}
          >
            <ErrorOutlineIcon color="error" fontSize="small" />
          </Tooltip>
        )}
        {icon && <TabIcon src={icon} alt={tab.connectionType} />}
        <TabTitle>{tab.connectionName}</TabTitle>
        <IconButton
          size="small"
          onClick={handleClose}
          aria-label={`Close ${tab.connectionName} tab`}
          sx={{
            ml: 0.5,
            width: 20,
            height: 20,
            color: 'text.secondary',
            '&:hover': { color: 'text.primary' },
          }}
        >
          <CloseIcon fontSize="inherit" />
        </IconButton>
      </SqlTabButton>
    </Tooltip>
  );
};

interface SqlTabManagerProps {
  tabs: SqlTabState[];
  activeTabId: SqlTabId | null;
  onSelect: (tabId: SqlTabId) => void;
  onClose: (tabId: SqlTabId) => void;
  onCloseOthers?: (tabId: SqlTabId) => void;
  onCloseToLeft?: (tabId: SqlTabId) => void;
  onCloseToRight?: (tabId: SqlTabId) => void;
  onCloseAll?: () => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  actions?: React.ReactNode;
}

type DragState = {
  tabId: SqlTabId | null;
  overTabId: SqlTabId | null;
};

export const SqlTabManager: React.FC<SqlTabManagerProps> = ({
  tabs,
  activeTabId,
  onSelect,
  onClose,
  onCloseOthers,
  onCloseToLeft,
  onCloseToRight,
  onCloseAll,
  onReorder,
  actions,
}) => {
  const [dragState, setDragState] = React.useState<DragState>({
    tabId: null,
    overTabId: null,
  });
  const [contextMenu, setContextMenu] = React.useState<{
    tabId: SqlTabId;
    position: { top: number; left: number };
  } | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const tabRefs = React.useRef<Map<SqlTabId, HTMLDivElement>>(new Map());

  const resetDragState = React.useCallback(() => {
    setDragState({ tabId: null, overTabId: null });
  }, []);

  const handleDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    tabId: SqlTabId,
  ) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', tabId);
    setDragState({ tabId, overTabId: null });
  };

  const handleDragEnd = (event?: React.DragEvent<HTMLDivElement>) => {
    if (event) {
      event.stopPropagation();
    }
    resetDragState();
  };

  const handleDragOverTab = (
    event: React.DragEvent<HTMLDivElement>,
    targetTabId: SqlTabId,
  ) => {
    if (!dragState.tabId || dragState.tabId === targetTabId) {
      return;
    }
    event.preventDefault();
    setDragState((prev) => ({
      ...prev,
      overTabId: targetTabId,
    }));
  };

  const handleDropOnTab = (
    event: React.DragEvent<HTMLDivElement>,
    targetTabId: SqlTabId,
  ) => {
    event.preventDefault();
    const { tabId } = dragState;
    if (!tabId || tabId === targetTabId) {
      resetDragState();
      return;
    }
    const fromIndex = tabs.findIndex((tab) => tab.id === tabId);
    const toIndex = tabs.findIndex((tab) => tab.id === targetTabId);
    if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
      onReorder(fromIndex, toIndex);
    }
    resetDragState();
  };

  const renderTab = (tab: SqlTabState) => {
    const showDropIndicator = dragState.overTabId === tab.id;
    return (
      <Box
        key={tab.id}
        ref={(node: HTMLDivElement | null) => {
          if (node) {
            tabRefs.current.set(tab.id, node);
          } else {
            tabRefs.current.delete(tab.id);
          }
        }}
        display="flex"
        alignItems="center"
        onDragOver={(event: React.DragEvent<HTMLDivElement>) =>
          handleDragOverTab(event, tab.id)
        }
        onDrop={(event: React.DragEvent<HTMLDivElement>) =>
          handleDropOnTab(event, tab.id)
        }
      >
        {showDropIndicator && <DropIndicator />}
        <Box
          draggable
          onDragStart={(event: React.DragEvent<HTMLDivElement>) =>
            handleDragStart(event, tab.id)
          }
          onDragEnd={handleDragEnd}
          sx={{ display: 'flex' }}
        >
          <SqlTab
            tab={tab}
            isActive={tab.id === activeTabId}
            onSelect={() => onSelect(tab.id)}
            onClose={() => onClose(tab.id)}
            onContextMenu={(event) => {
              setContextMenu({
                tabId: tab.id,
                position: { top: event.clientY, left: event.clientX },
              });
            }}
          />
        </Box>
      </Box>
    );
  };

  React.useEffect(() => {
    if (!activeTabId) {
      return;
    }
    const container = containerRef.current;
    const activeTabNode = tabRefs.current.get(activeTabId);
    if (!container || !activeTabNode) {
      return;
    }

    const tabStart = activeTabNode.offsetLeft;
    const tabEnd = tabStart + activeTabNode.offsetWidth;
    const visibleStart = container.scrollLeft;
    const visibleEnd = visibleStart + container.clientWidth;
    const padding = 16;

    if (tabStart < visibleStart) {
      container.scrollTo({
        left: Math.max(tabStart - padding, 0),
        behavior: 'smooth',
      });
      return;
    }

    if (tabEnd > visibleEnd) {
      container.scrollTo({
        left: tabEnd - container.clientWidth + padding,
        behavior: 'smooth',
      });
    }
  }, [activeTabId, tabs]);

  const contextTab = tabs.find((t) => t.id === contextMenu?.tabId);
  const contextIndex = tabs.findIndex((t) => t.id === contextMenu?.tabId);
  const hasTabsToLeft = contextIndex > 0;
  const hasTabsToRight = contextIndex !== -1 && contextIndex < tabs.length - 1;
  const hasOtherTabs = tabs.length > 1;

  return (
    <SqlTabBar>
      {tabs.length === 0 ? (
        <EmptyTabsPlaceholder>
          Select a connection to start querying
        </EmptyTabsPlaceholder>
      ) : (
        <TabsContainer ref={containerRef}>
          {tabs.map(renderTab)}
          {dragState.overTabId === null && dragState.tabId && <DropIndicator />}
        </TabsContainer>
      )}
      {actions}
      <TabContextMenu
        anchorPosition={contextMenu ? contextMenu.position : null}
        onClose={() => setContextMenu(null)}
        onCloseTab={() => {
          if (contextMenu) onClose(contextMenu.tabId);
        }}
        onCloseOthers={() => {
          if (contextMenu) onCloseOthers?.(contextMenu.tabId);
        }}
        onCloseToLeft={() => {
          if (contextMenu) onCloseToLeft?.(contextMenu.tabId);
        }}
        onCloseToRight={() => {
          if (contextMenu) onCloseToRight?.(contextMenu.tabId);
        }}
        onCloseAll={() => {
          if (onCloseAll) {
            onCloseAll();
          } else {
            tabs.forEach((tab) => onClose(tab.id));
          }
        }}
        hasTabsToLeft={hasTabsToLeft}
        hasTabsToRight={hasTabsToRight}
        hasOtherTabs={hasOtherTabs}
        extras={
          contextTab && (
            <>
              <MenuItem
                dense
                onClick={() => {
                  setContextMenu(null);
                  copyText(contextTab.query);
                }}
                sx={{ py: 0.5, minHeight: 'auto', fontSize: '0.8rem' }}
              >
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <ContentCopyIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primaryTypographyProps={{ fontSize: '0.8rem' }}>
                  Copy Query
                </ListItemText>
              </MenuItem>

              <MenuItem
                dense
                onClick={() => {
                  setContextMenu(null);
                  copyText(contextTab.connectionName);
                }}
                sx={{ py: 0.5, minHeight: 'auto', fontSize: '0.8rem' }}
              >
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <ContentCopyIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primaryTypographyProps={{ fontSize: '0.8rem' }}>
                  Copy Connection Name
                </ListItemText>
              </MenuItem>
            </>
          )
        }
      />
    </SqlTabBar>
  );
};

export default SqlTabManager;
