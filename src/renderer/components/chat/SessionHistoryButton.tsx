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
  TextField,
  ClickAwayListener,
} from '@mui/material';
import {
  History,
  Chat,
  Schedule,
  Delete,
  Edit,
  Check,
  Close,
} from '@mui/icons-material';
import type { ChatSession } from '../../../types/chat';

interface SessionHistoryButtonProps {
  sessions: ChatSession[];
  selectedId?: number;
  onSelect: (sessionId: number) => void;
  onDelete?: (sessionId: number) => void;
  onRename?: (sessionId: number, newTitle: string) => void;
  disabled?: boolean;
}

export const SessionHistoryButton: React.FC<SessionHistoryButtonProps> = ({
  sessions,
  selectedId,
  onSelect,
  onDelete,
  onRename,
  disabled = false,
}) => {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [hoveredSessionId, setHoveredSessionId] = React.useState<number | null>(
    null,
  );
  const [editingSessionId, setEditingSessionId] = React.useState<number | null>(
    null,
  );
  const [editTitle, setEditTitle] = React.useState<string>('');
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
    setHoveredSessionId(null);
    setEditingSessionId(null);
    setEditTitle('');
  };

  const handleSessionSelect = (sessionId: number) => {
    // Don't select if we're in edit mode
    if (editingSessionId === sessionId) return;

    onSelect(sessionId);
    handleClose();
  };

  const handleDeleteSession = (event: React.MouseEvent, sessionId: number) => {
    event.stopPropagation();
    if (onDelete) {
      onDelete(sessionId);
    }
  };

  const handleStartRename = (event: React.MouseEvent, sessionId: number) => {
    event.stopPropagation();
    const session = sessions.find((s) => s.id === sessionId);
    if (session) {
      setEditingSessionId(sessionId);
      setEditTitle(session.title);
      setHoveredSessionId(null);
    }
  };

  const handleCancelRename = () => {
    setEditingSessionId(null);
    setEditTitle('');
  };

  const handleSaveRename = () => {
    if (onRename && editingSessionId && editTitle.trim() !== '') {
      const session = sessions.find((s) => s.id === editingSessionId);
      if (session && editTitle.trim() !== session.title) {
        onRename(editingSessionId, editTitle.trim());
      }
    }
    setEditingSessionId(null);
    setEditTitle('');
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleSaveRename();
    } else if (event.key === 'Escape') {
      handleCancelRename();
    }
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

  // Sort sessions by most recent first (based on creation date)
  const sortedSessions = [...sessions].sort((a, b) => {
    if (!a.createdAt) return 1;
    if (!b.createdAt) return -1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
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
                onMouseEnter={() =>
                  !editingSessionId && setHoveredSessionId(session.id as number)
                }
                onMouseLeave={() => setHoveredSessionId(null)}
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
                      {editingSessionId === session.id ? (
                        <ClickAwayListener onClickAway={handleCancelRename}>
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.5,
                              flex: 1,
                              minWidth: 0,
                            }}
                          >
                            <TextField
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              onKeyDown={handleKeyPress}
                              size="small"
                              variant="outlined"
                              autoFocus
                              sx={{
                                flex: 1,
                                '& .MuiOutlinedInput-root': {
                                  height: 28,
                                  fontSize: '0.875rem',
                                },
                                '& .MuiOutlinedInput-input': {
                                  py: 0.5,
                                  px: 1,
                                },
                              }}
                            />
                            <IconButton
                              size="small"
                              onClick={handleSaveRename}
                              sx={{
                                p: 0.25,
                                color: 'success.main',
                                '&:hover': {
                                  backgroundColor: 'success.50',
                                },
                              }}
                            >
                              <Check sx={{ fontSize: 14 }} />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={handleCancelRename}
                              sx={{
                                p: 0.25,
                                color: 'text.secondary',
                                '&:hover': {
                                  backgroundColor: 'action.hover',
                                },
                              }}
                            >
                              <Close sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Box>
                        </ClickAwayListener>
                      ) : (
                        <>
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

                          {/* Action buttons that appear on hover */}
                          {hoveredSessionId === session.id ? (
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                                flexShrink: 0,
                              }}
                            >
                              {onRename && (
                                <Tooltip title="Rename session">
                                  <IconButton
                                    size="small"
                                    onClick={(e) =>
                                      handleStartRename(e, session.id as number)
                                    }
                                    sx={{
                                      p: 0.25,
                                      '&:hover': {
                                        backgroundColor: 'action.hover',
                                      },
                                    }}
                                  >
                                    <Edit sx={{ fontSize: 14 }} />
                                  </IconButton>
                                </Tooltip>
                              )}
                              {onDelete && (
                                <Tooltip title="Delete session">
                                  <IconButton
                                    size="small"
                                    onClick={(e) =>
                                      handleDeleteSession(
                                        e,
                                        session.id as number,
                                      )
                                    }
                                    sx={{
                                      p: 0.25,
                                      color: 'text.secondary',
                                      '&:hover': {
                                        backgroundColor: 'action.hover',
                                      },
                                    }}
                                  >
                                    <Delete sx={{ fontSize: 14 }} />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Box>
                          ) : (
                            // Show timestamp when not hovering
                            session.updatedAt && (
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
                            )
                          )}
                        </>
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
