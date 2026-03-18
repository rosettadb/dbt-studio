import React from 'react';
import { Box, IconButton, Tooltip, useTheme } from '@mui/material';
import { Close, Description } from '@mui/icons-material';
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

  const getBaseBackgroundColor = () => {
    if (!isActive) {
      return 'transparent';
    }
    return theme.palette.mode === 'dark'
      ? 'rgba(255,255,255,0.08)'
      : 'rgba(0,0,0,0.08)';
  };

  const getHoverBackgroundColor = () => {
    if (!isActive) {
      return theme.palette.action.hover;
    }
    return theme.palette.mode === 'dark'
      ? 'rgba(255,255,255,0.12)'
      : 'rgba(0,0,0,0.12)';
  };

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
          gap: 0.75,
          px: 1.25,
          py: 0.5,
          minHeight: 32,
          cursor: 'pointer',
          userSelect: 'none',
          borderRadius: 0,
          bgcolor: getBaseBackgroundColor(),
          color: isActive ? 'text.primary' : 'text.secondary',
          borderTop: isActive
            ? `2px solid ${theme.palette.primary.main}`
            : `1px solid ${theme.palette.divider}`,
          borderBottom: isActive
            ? '1px solid transparent'
            : `1px solid ${theme.palette.divider}`,
          borderLeft: `1px solid ${theme.palette.divider}`,
          borderRight: `1px solid ${theme.palette.divider}`,
          transition:
            'background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease',
          '&:hover': {
            bgcolor: getHoverBackgroundColor(),
            color: 'text.primary',
          },
          '&:not(:first-of-type)': {
            marginLeft: -1,
          },
          '&:first-of-type': {
            borderLeft: `1px solid ${theme.palette.divider}`,
            marginLeft: 0,
          },
          '&:last-of-type': {
            borderRight: `1px solid ${theme.palette.divider}`,
          },
        }}
      >
        {tab.isModified && (
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: theme.palette.warning.main,
            }}
          />
        )}
        <Description sx={{ fontSize: 16, color: 'inherit' }} />
        <Box
          sx={{
            fontSize: 13,
            lineHeight: 1.2,
            maxWidth: 160,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: 'text.primary',
          }}
        >
          {tab.notebookName}
        </Box>
        <IconButton
          size="small"
          onClick={handleClose}
          aria-label={`Close ${tab.notebookName} tab`}
          sx={{
            ml: 0.5,
            width: 20,
            height: 20,
            color: 'text.secondary',
            '&:hover': { color: 'text.primary' },
          }}
        >
          <Close fontSize="inherit" />
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
              width: 3,
              height: 22,
              borderRadius: 999,
              bgcolor: theme.palette.mode === 'dark' ? '#2d2d2d' : '#e0e0e0',
              boxShadow: `0 0 0 1px ${theme.palette.background.paper}`,
              transition: 'opacity 120ms ease',
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

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        bgcolor: theme.palette.background.default,
        borderBottom: `0.5px solid ${theme.palette.divider}`,
        px: 1,
        height: 40,
        minWidth: 0,
      }}
    >
      <Box
        ref={containerRef}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          flex: 1,
          minWidth: 0,
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          '&::-webkit-scrollbar': {
            display: 'none',
          },
        }}
      >
        {tabs.map(renderTab)}
        {dragState.overTabId === null && dragState.tabId && (
          <Box
            sx={{
              width: 3,
              height: 22,
              borderRadius: 999,
              bgcolor: theme.palette.primary.main,
              boxShadow: `0 0 0 1px ${theme.palette.background.paper}`,
              transition: 'opacity 120ms ease',
            }}
          />
        )}
      </Box>
    </Box>
  );
};

export default NotebookTabManager;
