import React from 'react';
import { Box, IconButton, Tooltip, useTheme } from '@mui/material';
import { Close, Description, FiberManualRecord } from '@mui/icons-material';
import { NotebookTabState } from '../../hooks/useNotebookTabManager';

interface NotebookTabProps {
  tab: NotebookTabState;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
}

const NotebookTab: React.FC<NotebookTabProps> = ({
  tab,
  isActive,
  onSelect,
  onClose,
}) => {
  const theme = useTheme();

  const handleClose = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onClose();
  };

  const getBgColor = () => {
    if (isActive) {
      return theme.palette.background.paper;
    }
    return theme.palette.mode === 'dark' ? '#1e1e1e' : '#f5f5f5';
  };

  const bgColor = getBgColor();

  return (
    <Tooltip
      title={tab.notebookName}
      arrow
      placement="bottom"
      enterDelay={600}
      enterNextDelay={600}
    >
      <Box
        onClick={onSelect}
        role="tab"
        tabIndex={0}
        aria-selected={isActive}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect();
          }
        }}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1.5,
          py: 0.75,
          cursor: 'pointer',
          userSelect: 'none',
          borderRight: `1px solid ${theme.palette.divider}`,
          bgcolor: bgColor,
          borderBottom: isActive
            ? 'none'
            : `1px solid ${theme.palette.divider}`,
          '&:hover': {
            bgcolor: isActive
              ? theme.palette.background.paper
              : theme.palette.action.hover,
          },
          transition: 'background-color 0.2s',
          minWidth: 120,
          maxWidth: 200,
        }}
      >
        {tab.isModified && (
          <FiberManualRecord
            sx={{
              fontSize: 8,
              color: theme.palette.primary.main,
            }}
          />
        )}
        <Description sx={{ fontSize: 16, color: 'text.secondary' }} />
        <Box
          sx={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: '0.8rem',
          }}
        >
          {tab.notebookName}
        </Box>
        <IconButton
          size="small"
          onClick={handleClose}
          aria-label={`Close ${tab.notebookName} tab`}
          sx={{
            width: 20,
            height: 20,
            color: 'text.secondary',
            '&:hover': { color: 'text.primary' },
          }}
        >
          <Close sx={{ fontSize: 14 }} />
        </IconButton>
      </Box>
    </Tooltip>
  );
};

interface NotebookTabManagerProps {
  tabs: NotebookTabState[];
  activeTabId: string | null;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

type DragState = {
  tabId: string | null;
  overTabId: string | null;
};

export const NotebookTabManager: React.FC<NotebookTabManagerProps> = ({
  tabs,
  activeTabId,
  onSelect,
  onClose,
  onReorder,
}) => {
  const theme = useTheme();
  const [dragState, setDragState] = React.useState<DragState>({
    tabId: null,
    overTabId: null,
  });
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const tabRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());

  const resetDragState = React.useCallback(() => {
    setDragState({ tabId: null, overTabId: null });
  }, []);

  const handleDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    tabId: string,
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
    targetTabId: string,
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
    targetTabId: string,
  ) => {
    event.preventDefault();
    const { tabId } = dragState;
    if (!tabId || tabId === targetTabId) {
      resetDragState();
      return;
    }
    const fromIndex = tabs.findIndex((tab) => tab.notebookId === tabId);
    const toIndex = tabs.findIndex((tab) => tab.notebookId === targetTabId);
    if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
      onReorder(fromIndex, toIndex);
    }
    resetDragState();
  };

  const renderTab = (tab: NotebookTabState) => {
    const showDropIndicator = dragState.overTabId === tab.notebookId;
    return (
      <Box
        key={tab.notebookId}
        ref={(node: HTMLDivElement | null) => {
          if (node) {
            tabRefs.current.set(tab.notebookId, node);
          } else {
            tabRefs.current.delete(tab.notebookId);
          }
        }}
        display="flex"
        alignItems="center"
        onDragOver={(event: React.DragEvent<HTMLDivElement>) =>
          handleDragOverTab(event, tab.notebookId)
        }
        onDrop={(event: React.DragEvent<HTMLDivElement>) =>
          handleDropOnTab(event, tab.notebookId)
        }
      >
        {showDropIndicator && (
          <Box
            sx={{
              width: 2,
              height: 32,
              bgcolor: theme.palette.primary.main,
              mr: -1,
              zIndex: 1,
            }}
          />
        )}
        <Box
          draggable
          onDragStart={(event: React.DragEvent<HTMLDivElement>) =>
            handleDragStart(event, tab.notebookId)
          }
          onDragEnd={handleDragEnd}
          sx={{ display: 'flex' }}
        >
          <NotebookTab
            tab={tab}
            isActive={tab.notebookId === activeTabId}
            onSelect={() => onSelect(tab.notebookId)}
            onClose={() => onClose(tab.notebookId)}
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

  if (tabs.length === 0) {
    return null;
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        borderBottom: `1px solid ${theme.palette.divider}`,
        bgcolor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#f5f5f5',
        minHeight: 40,
      }}
    >
      <Box
        ref={containerRef}
        sx={{
          display: 'flex',
          alignItems: 'center',
          overflowX: 'auto',
          overflowY: 'hidden',
          flex: 1,
          '&::-webkit-scrollbar': {
            height: 6,
          },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: theme.palette.mode === 'dark' ? '#555' : '#ccc',
            borderRadius: 3,
          },
        }}
      >
        {tabs.map(renderTab)}
        {dragState.overTabId === null && dragState.tabId && (
          <Box
            sx={{
              width: 2,
              height: 32,
              bgcolor: theme.palette.primary.main,
              ml: -1,
              zIndex: 1,
            }}
          />
        )}
      </Box>
    </Box>
  );
};

export default NotebookTabManager;
