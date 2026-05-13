import React from 'react';
import { styled, alpha } from '@mui/material/styles';
import { Chip } from '@mui/material';
import {
  Edit as EditIcon,
  Add as AddIcon,
  Check as CheckIcon,
  Delete as DeleteIcon,
  DriveFileRenameOutline as RenameIcon,
  WarningAmber as ConflictIcon,
} from '@mui/icons-material';
import { GitStatus } from './types';

// MUI's `styled` forwards every prop to the underlying component by default
// — it does not honour the styled-components `$` convention. Filter
// $status out explicitly so it doesn't end up as a DOM attribute on the
// rendered <div> (which triggers React's "Invalid attribute name" warning).
const StyledChip = styled(Chip, {
  shouldForwardProp: (prop) => prop !== '$status',
})<{ $status: GitStatus }>(({ theme, $status }) => {
  const getStatusColor = () => {
    switch ($status) {
      case 'modified':
        return theme.palette.success.main;
      case 'untracked':
        return theme.palette.error.main;
      case 'staged':
        return theme.palette.success.main;
      case 'deleted':
        return theme.palette.error.main;
      case 'renamed':
        return theme.palette.info.main;
      case 'conflicted':
        return theme.palette.warning.main;
      default:
        return theme.palette.grey[500];
    }
  };

  const color = getStatusColor();

  return {
    height: 18,
    fontSize: '0.65rem',
    fontWeight: 600,
    padding: '0 4px',
    backgroundColor: alpha(color, 0.12),
    color,
    borderRadius: 4,
    '& .MuiChip-icon': {
      fontSize: 12,
      marginLeft: 2,
      marginRight: -2,
      color,
    },
    '& .MuiChip-label': {
      padding: '0 4px',
      lineHeight: 1,
    },
  };
});

interface GitStatusBadgeProps {
  status: GitStatus;
}

const getStatusLabel = (status: GitStatus): string => {
  switch (status) {
    case 'modified':
      return 'M';
    case 'untracked':
      return 'U';
    case 'staged':
      return 'S';
    case 'deleted':
      return 'D';
    case 'renamed':
      return 'R';
    case 'conflicted':
      return 'C';
    default:
      return '';
  }
};

const getStatusIcon = (status: GitStatus) => {
  const iconStyle = { fontSize: 12 };
  switch (status) {
    case 'modified':
      return <EditIcon style={iconStyle} />;
    case 'untracked':
      return <AddIcon style={iconStyle} />;
    case 'staged':
      return <CheckIcon style={iconStyle} />;
    case 'deleted':
      return <DeleteIcon style={iconStyle} />;
    case 'renamed':
      return <RenameIcon style={iconStyle} />;
    case 'conflicted':
      return <ConflictIcon style={iconStyle} />;
    default:
      return null;
  }
};

export const GitStatusBadge: React.FC<GitStatusBadgeProps> = ({ status }) => {
  return (
    <StyledChip
      $status={status}
      label={getStatusLabel(status)}
      icon={getStatusIcon(status) || undefined}
      size="small"
    />
  );
};
