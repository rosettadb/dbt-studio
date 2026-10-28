import React from 'react';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Divider from '@mui/material/Divider';
import CloseIcon from '@mui/icons-material/Close';
import PlaylistRemoveIcon from '@mui/icons-material/PlaylistRemove';
import KeyboardTabIcon from '@mui/icons-material/KeyboardTab';
import BookmarkRemoveIcon from '@mui/icons-material/BookmarkRemove';
import ClearAllIcon from '@mui/icons-material/ClearAll';

export interface TabContextMenuProps {
  anchorPosition: { top: number; left: number } | null;
  onClose: () => void;
  onCloseTab: () => void;
  onCloseOthers: () => void;
  onCloseToLeft: () => void;
  onCloseToRight: () => void;
  onCloseAll: () => void;
  onCloseSaved?: () => void;
  hasTabsToLeft: boolean;
  hasTabsToRight: boolean;
  hasOtherTabs: boolean;
  hasSavedTabs?: boolean;
  extras?: React.ReactNode;
}

export const TabContextMenu: React.FC<TabContextMenuProps> = ({
  anchorPosition,
  onClose,
  onCloseTab,
  onCloseOthers,
  onCloseToLeft,
  onCloseToRight,
  onCloseAll,
  onCloseSaved,
  hasTabsToLeft,
  hasTabsToRight,
  hasOtherTabs,
  hasSavedTabs,
  extras,
}) => {
  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <Menu
      open={Boolean(anchorPosition)}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={anchorPosition ?? undefined}
      MenuListProps={{ dense: true }}
    >
      <MenuItem
        dense
        onClick={() => handleAction(onCloseTab)}
        sx={{ py: 0.5, minHeight: 'auto', fontSize: '0.8rem' }}
      >
        <ListItemIcon sx={{ minWidth: 28 }}>
          <CloseIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: '0.8rem' }}>
          Close
        </ListItemText>
      </MenuItem>

      <MenuItem
        dense
        disabled={!hasOtherTabs}
        onClick={() => handleAction(onCloseOthers)}
        sx={{ py: 0.5, minHeight: 'auto', fontSize: '0.8rem' }}
      >
        <ListItemIcon sx={{ minWidth: 28 }}>
          <PlaylistRemoveIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: '0.8rem' }}>
          Close Others
        </ListItemText>
      </MenuItem>

      <MenuItem
        dense
        disabled={!hasTabsToLeft}
        onClick={() => handleAction(onCloseToLeft)}
        sx={{ py: 0.5, minHeight: 'auto', fontSize: '0.8rem' }}
      >
        <ListItemIcon sx={{ minWidth: 28 }}>
          <KeyboardTabIcon fontSize="small" sx={{ transform: 'scaleX(-1)' }} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: '0.8rem' }}>
          Close to the Left
        </ListItemText>
      </MenuItem>

      <MenuItem
        dense
        disabled={!hasTabsToRight}
        onClick={() => handleAction(onCloseToRight)}
        sx={{ py: 0.5, minHeight: 'auto', fontSize: '0.8rem' }}
      >
        <ListItemIcon sx={{ minWidth: 28 }}>
          <KeyboardTabIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: '0.8rem' }}>
          Close to the Right
        </ListItemText>
      </MenuItem>

      {onCloseSaved !== undefined && (
        <MenuItem
          dense
          disabled={!hasSavedTabs}
          onClick={() => handleAction(onCloseSaved)}
          sx={{ py: 0.5, minHeight: 'auto', fontSize: '0.8rem' }}
        >
          <ListItemIcon sx={{ minWidth: 28 }}>
            <BookmarkRemoveIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: '0.8rem' }}>
            Close Saved
          </ListItemText>
        </MenuItem>
      )}

      <MenuItem
        dense
        onClick={() => handleAction(onCloseAll)}
        sx={{ py: 0.5, minHeight: 'auto', fontSize: '0.8rem' }}
      >
        <ListItemIcon sx={{ minWidth: 28 }}>
          <ClearAllIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: '0.8rem' }}>
          Close All
        </ListItemText>
      </MenuItem>

      {extras && (
        <>
          <Divider sx={{ my: 0.5 }} />
          {extras}
        </>
      )}
    </Menu>
  );
};

export default TabContextMenu;
