import React from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import { EditorTabId, EditorTabState } from '../../../../types/editor';
import {
  TabBar,
  EmptyTabsPlaceholder,
  TabsContainer,
  DropIndicator,
} from './styles';
import { EditorTab } from './EditorTab';

interface TabManagerProps {
  tabs: EditorTabState[];
  activeTabId: EditorTabId | null;
  onSelect: (tabId: EditorTabId) => void;
  onClose: (tabId: EditorTabId) => void;
  onCloseAll?: () => void;
  onSaveAll?: () => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

type DragState = {
  tabId: EditorTabId | null;
  overTabId: EditorTabId | null;
};

export const TabManager: React.FC<TabManagerProps> = ({
  tabs,
  activeTabId,
  onSelect,
  onClose,
  onCloseAll,
  onSaveAll,
  onReorder,
}) => {
  const [dragState, setDragState] = React.useState<DragState>({
    tabId: null,
    overTabId: null,
  });
  const [menuAnchor, setMenuAnchor] = React.useState<HTMLElement | null>(null);
  const [containerEl, setContainerEl] = React.useState<HTMLDivElement | null>(
    null,
  );
  const containerRef = React.useCallback((node: HTMLDivElement | null) => {
    setContainerEl(node);
  }, []);
  const tabRefs = React.useRef<Map<EditorTabId, HTMLDivElement>>(new Map());

  const resetDragState = React.useCallback(() => {
    setDragState({ tabId: null, overTabId: null });
  }, []);

  const handleDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    tabId: EditorTabId,
  ) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', tabId);
    event.dataTransfer.setData('application/x-file-path', tabId);
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
    targetTabId: EditorTabId,
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
    targetTabId: EditorTabId,
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

  const renderTab = (tab: EditorTabState, index: number) => {
    const showDropIndicator = dragState.overTabId === tab.id;
    const isLast = index === tabs.length - 1;
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
          <EditorTab
            tab={tab}
            isActive={tab.id === activeTabId}
            isLast={isLast}
            onSelect={() => onSelect(tab.id)}
            onClose={() => onClose(tab.id)}
          />
        </Box>
      </Box>
    );
  };

  React.useEffect(() => {
    if (!containerEl) {
      return undefined;
    }

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      if (containerEl.scrollWidth <= containerEl.clientWidth) {
        return;
      }
      const delta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;
      if (delta === 0) {
        return;
      }
      event.preventDefault();
      containerEl.scrollLeft += delta * 0.5;
    };

    containerEl.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      containerEl.removeEventListener('wheel', handleWheel);
    };
  }, [containerEl]);

  React.useEffect(() => {
    if (!activeTabId) {
      return;
    }
    const container = containerEl;
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
  }, [activeTabId, tabs, containerEl]);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setMenuAnchor(event.currentTarget);
  };
  const handleMenuClose = () => setMenuAnchor(null);
  const handleCloseAll = () => {
    handleMenuClose();
    if (onCloseAll) {
      onCloseAll();
      return;
    }
    tabs.forEach((tab) => onClose(tab.id));
  };
  const hasUnsaved = tabs.some((tab) => tab.isModified);
  const handleSaveAll = () => {
    handleMenuClose();
    onSaveAll?.();
  };

  return (
    <TabBar>
      {tabs.length === 0 ? (
        <EmptyTabsPlaceholder>No open files</EmptyTabsPlaceholder>
      ) : (
        <>
          <TabsContainer ref={containerRef}>
            {tabs.map(renderTab)}
            {dragState.overTabId === null && dragState.tabId && (
              <DropIndicator />
            )}
          </TabsContainer>
          <Tooltip title="More" placement="bottom" arrow>
            <IconButton
              size="small"
              onClick={handleMenuOpen}
              sx={{
                ml: 0.5,
                width: 24,
                height: 24,
                flexShrink: 0,
                color: 'text.secondary',
                '&:hover': { color: 'text.primary' },
              }}
            >
              <MoreHorizIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={handleMenuClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <MenuItem onClick={handleSaveAll} disabled={!hasUnsaved}>
              <ListItemIcon>
                <SaveIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Save all</ListItemText>
            </MenuItem>
            <MenuItem onClick={handleCloseAll}>
              <ListItemIcon>
                <CloseIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Close all tabs</ListItemText>
            </MenuItem>
          </Menu>
        </>
      )}
    </TabBar>
  );
};
