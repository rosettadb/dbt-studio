import React from 'react';
import Box from '@mui/material/Box';
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
  onReorder,
}) => {
  const [dragState, setDragState] = React.useState<DragState>({
    tabId: null,
    overTabId: null,
  });
  const containerRef = React.useRef<HTMLDivElement | null>(null);
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

  const renderTab = (tab: EditorTabState) => {
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
          <EditorTab
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
    <TabBar>
      {tabs.length === 0 ? (
        <EmptyTabsPlaceholder>No open files</EmptyTabsPlaceholder>
      ) : (
        <TabsContainer ref={containerRef}>
          {tabs.map(renderTab)}
          {dragState.overTabId === null && dragState.tabId && <DropIndicator />}
        </TabsContainer>
      )}
    </TabBar>
  );
};
