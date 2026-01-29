import React from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import CloseIcon from '@mui/icons-material/Close';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { SqlTabId, SqlTabState } from '../../../types/editor';
import connectionIcons from '../../../../assets/connectionIcons';
import {
  SqlTabBar,
  TabsContainer,
  DropIndicator,
  SqlTabButton,
  TabTitle,
  TabIcon,
  ModifiedDot,
  LoadingDot,
  EmptyTabsPlaceholder,
} from './styles';

interface SqlTabProps {
  tab: SqlTabState;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
}

const SqlTab: React.FC<SqlTabProps> = ({
  tab,
  isActive,
  onSelect,
  onClose,
}) => {
  const handleClose = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onClose();
  };

  // Get connection type icon
  const icon =
    connectionIcons.images[
      tab.connectionType as keyof typeof connectionIcons.images
    ];

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
        {!tab.isLoading && tab.isModified && <ModifiedDot />}
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
  onReorder: (fromIndex: number, toIndex: number) => void;
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
  onReorder,
}) => {
  const [dragState, setDragState] = React.useState<DragState>({
    tabId: null,
    overTabId: null,
  });
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
    </SqlTabBar>
  );
};

export default SqlTabManager;
