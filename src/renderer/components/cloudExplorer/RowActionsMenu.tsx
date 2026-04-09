import React, { useState } from 'react';
import {
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DownloadIcon from '@mui/icons-material/Download';
import TableViewIcon from '@mui/icons-material/TableView';
import DeleteIcon from '@mui/icons-material/Delete';
import { DBTProjects } from '../sidebar/icons';

export interface RowAction {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  hidden?: boolean;
}

interface RowActionsMenuProps {
  actions: RowAction[];
  'aria-label'?: string;
}

const RowActionsMenu: React.FC<RowActionsMenuProps> = ({
  actions,
  'aria-label': ariaLabel,
}) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleOpen = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    setAnchorEl(e.currentTarget);
  };

  const handleClose = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setAnchorEl(null);
  };

  const visibleActions = actions.filter((a) => !a.hidden);

  return (
    <>
      <Tooltip title="Actions">
        <IconButton
          size="small"
          onClick={handleOpen}
          aria-label={ariaLabel || 'row actions'}
          aria-controls={open ? 'row-actions-menu' : undefined}
          aria-haspopup="true"
          aria-expanded={open ? 'true' : undefined}
        >
          <MoreVertIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu
        id="row-actions-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={(e) => handleClose(e as React.MouseEvent)}
        onClick={(e) => e.stopPropagation()}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        {visibleActions.map((action) => (
          <MenuItem
            key={action.key}
            disabled={action.disabled || action.loading}
            onClick={(e) => {
              e.stopPropagation();
              handleClose();
              action.onClick();
            }}
            dense
          >
            <ListItemIcon sx={{ minWidth: 32 }}>
              {action.loading ? (
                <CircularProgress size={16} />
              ) : (
                action.icon
              )}
            </ListItemIcon>
            <ListItemText>{action.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

export default RowActionsMenu;

// Pre-built action factories for common operations
export const makePreviewAction = (
  onClick: () => void,
  hidden = false,
): RowAction => ({
  key: 'preview',
  label: 'Preview data',
  icon: <TableViewIcon fontSize="small" />,
  onClick,
  hidden,
});

export const makeDownloadAction = (
  onClick: () => void,
  loading = false,
): RowAction => ({
  key: 'download',
  label: 'Download',
  icon: <DownloadIcon fontSize="small" />,
  onClick,
  loading,
});

export const makeDownloadAsSeedAction = (
  onClick: () => void,
  loading = false,
  hidden = false,
): RowAction => ({
  key: 'download-seed',
  label: 'Download as seed',
  icon: <DBTProjects />,
  onClick,
  loading,
  hidden,
});

export const makeDeleteAction = (onClick: () => void): RowAction => ({
  key: 'delete',
  label: 'Delete',
  icon: <DeleteIcon fontSize="small" color="error" />,
  onClick,
});
