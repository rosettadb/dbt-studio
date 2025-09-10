import React from 'react';
import {
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Typography,
  Box,
  Divider,
} from '@mui/material';
import { History, Chat, Schedule } from '@mui/icons-material';
import type { ChatSession } from '../../../types/chat';

interface SessionHistoryButtonProps {
  sessions: ChatSession[];
  selectedId?: number;
  onSelect: (sessionId: number) => void;
  disabled?: boolean;
}

export const SessionHistoryButton: React.FC<SessionHistoryButtonProps> = ({
  sessions,
  selectedId,
  onSelect,
  disabled = false,
}) => {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSessionSelect = (sessionId: number) => {
    onSelect(sessionId);
    handleClose();
  };

  const formatLastActivity = (session: ChatSession) => {
    if (!session.updatedAt) return '';

    const date = new Date(session.updatedAt);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      return 'Just now';
    }
    if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    }
    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays}d ago`;
  };

  const formatSessionTitle = (session: ChatSession) => {
    if (session.title.length > 35) {
      return `${session.title.substring(0, 35)}...`;
    }
    return session.title;
  };

  // Sort sessions by most recent first
  const sortedSessions = [...sessions].sort((a, b) => {
    if (!a.updatedAt) return 1;
    if (!b.updatedAt) return -1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return (
    <>
      <Tooltip title="Session History">
        <IconButton
          size="small"
          onClick={handleClick}
          disabled={disabled || sessions.length === 0}
          sx={{
            color: sessions.length === 0 ? 'text.disabled' : 'text.secondary',
            '&:hover': {
              color: 'primary.main',
            },
          }}
        >
          <History fontSize="small" />
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        PaperProps={{
          sx: {
            maxHeight: 400,
            minWidth: 380,
            maxWidth: 520,
          },
        }}
      >
        <Box
          sx={{
            px: 2,
            py: 0.5,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Typography variant="subtitle2" color="text.secondary">
            Recent Sessions ({sessions.length})
          </Typography>
        </Box>

        {sortedSessions.length === 0 ? (
          <MenuItem disabled sx={{ py: 0 }}>
            <ListItemText primary="No sessions available" />
          </MenuItem>
        ) : (
          sortedSessions.map((session, index) => (
            <React.Fragment key={session.id}>
              <MenuItem
                onClick={() => handleSessionSelect(session.id as number)}
                selected={session.id === selectedId}
                sx={{
                  py: 1,
                  px: 2,
                  minHeight: 'auto',
                  '&.Mui-selected': {
                    backgroundColor: 'primary.50',
                    '&:hover': {
                      backgroundColor: 'primary.100',
                    },
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <Chat
                    fontSize="small"
                    color={session.id === selectedId ? 'primary' : 'inherit'}
                  />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1,
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: session.id === selectedId ? 600 : 400,
                          color:
                            session.id === selectedId
                              ? 'primary.main'
                              : 'text.primary',
                          lineHeight: 1.3,
                          flex: 1,
                          minWidth: 0,
                        }}
                        noWrap
                      >
                        {formatSessionTitle(session)}
                      </Typography>
                      {session.updatedAt && (
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.25,
                            flexShrink: 0,
                          }}
                        >
                          <Schedule
                            fontSize="small"
                            sx={{ fontSize: 10, color: 'text.disabled' }}
                          />
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ lineHeight: 1.2, fontSize: '0.625rem' }}
                          >
                            {formatLastActivity(session)}
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  }
                />
              </MenuItem>
              {index < sortedSessions.length - 1 && <Divider />}
            </React.Fragment>
          ))
        )}
      </Menu>
    </>
  );
};
