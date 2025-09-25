import React from 'react';
import Box from '@mui/material/Box';
import AddIcon from '@mui/icons-material/Add';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import { EditorTabState, EditorTabId } from '../types';
import { TabBar, EmptyTabsPlaceholder } from './styles';
import { EditorTab } from './EditorTab';

interface TabManagerProps {
  tabs: EditorTabState[];
  activeTabId: EditorTabId | null;
  onSelect: (tabId: EditorTabId) => void;
  onClose: (tabId: EditorTabId) => void;
  onCreateNew?: () => void;
}

export const TabManager: React.FC<TabManagerProps> = ({
  tabs,
  activeTabId,
  onSelect,
  onClose,
  onCreateNew,
}) => {
  const renderTabs = () => {
    if (tabs.length === 0) {
      return <EmptyTabsPlaceholder>No open files</EmptyTabsPlaceholder>;
    }

    return tabs.map((tab) => (
      <EditorTab
        key={tab.id}
        tab={tab}
        isActive={tab.id === activeTabId}
        onSelect={() => onSelect(tab.id)}
        onClose={() => onClose(tab.id)}
      />
    ));
  };

  return (
    <TabBar>
      <Box display="flex" alignItems="center" flex={1} minWidth={0} gap={0.5}>
        {renderTabs()}
      </Box>
      {onCreateNew && (
        <Tooltip title="New tab" arrow>
          <IconButton size="small" onClick={onCreateNew}>
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </TabBar>
  );
};
