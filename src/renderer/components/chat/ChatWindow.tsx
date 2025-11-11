import React from 'react';
import {
  Box,
  Paper,
  IconButton,
  Tooltip,
  Typography,
  Button,
  CircularProgress,
} from '@mui/material';
import { Close } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAppContext } from '../../hooks';
import { useGetSelectedProject } from '../../controllers';
import {
  useCreateChatSession,
  useGetChatSessions,
  useUpdateChatSession,
  useDeleteChatSession,
} from '../../controllers/chat.controller';
import { useGetAIProviders } from '../../controllers/aiProviders.controller';
import { NewChatButton } from './NewChatButton';
import { SessionHistoryButton } from './SessionHistoryButton';
import { ChatMessageList } from './ChatMessageList';
import { ChatInputBox } from './ChatInputBox';

import { useContextManager } from '../../hooks/useContextManager';

export const ChatWindow: React.FC = () => {
  const { setIsChatOpen } = useAppContext();
  const { data: project } = useGetSelectedProject();
  const projectId = project?.id as number | undefined;
  const navigate = useNavigate();

  const [selectedSessionId, setSelectedSessionId] = React.useState<number>();

  // Context management
  const contextManager = useContextManager();

  const { data: sessions = [], isLoading } = useGetChatSessions(projectId);
  const { data: providers = [], isLoading: isLoadingProviders } =
    useGetAIProviders();
  const { mutate: createSession, isLoading: isCreating } = useCreateChatSession(
    {
      onSuccess: (session) =>
        setSelectedSessionId(session.id as unknown as number),
      onError: (error) => {
        toast.error(`Failed to create session: ${error.message}`);
      },
    },
  );

  const { mutate: updateSession } = useUpdateChatSession({
    onError: (error) => {
      toast.error(`Failed to update session: ${error.message}`);
    },
  });
  const { mutate: deleteSession } = useDeleteChatSession({
    onSuccess: (_, deletedSessionId) => {
      // If the deleted session was selected, switch to another session
      if (selectedSessionId === deletedSessionId) {
        const remainingSessions = sessions.filter(
          (s) => s.id !== deletedSessionId,
        );
        if (remainingSessions.length > 0) {
          setSelectedSessionId(remainingSessions[0].id as unknown as number);
        } else {
          setSelectedSessionId(undefined);
        }
      }
    },
    onError: (error) => {
      toast.error(`Failed to delete session: ${error.message}`);
    },
  });

  React.useEffect(() => {
    if (isLoading) return;
    if (sessions.length > 0) {
      setSelectedSessionId(
        (prev) => prev ?? (sessions[0].id as unknown as number),
      );
      return;
    }
    if (projectId) {
      // Auto-create a default chat session for the project
      createSession({ title: 'New Chat', projectId });
    }
  }, [sessions, isLoading, projectId]);

  const handleCreateNewSession = () => {
    if (projectId) {
      const sessionCount = sessions.length;
      const title = `Chat ${sessionCount + 1}`;
      createSession({ title, projectId });
    }
  };

  const handleSessionSelect = (sessionId: number) => {
    setSelectedSessionId(sessionId);
  };

  const handleSessionDelete = (sessionId: number) => {
    deleteSession(sessionId);
  };

  const handleSessionRename = (sessionId: number, newTitle: string) => {
    updateSession({
      sessionId,
      updates: { title: newTitle },
    });
  };

  const renderMessages = () => {
    if (isLoadingProviders) {
      return (
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1.5,
          }}
        >
          <CircularProgress size={18} />
          <Typography variant="body2" color="text.secondary">
            Loading AI providers...
          </Typography>
        </Box>
      );
    }

    if (providers.length === 0) {
      return (
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1.5,
            textAlign: 'center',
            px: 3,
          }}
        >
          <Typography variant="subtitle1" fontWeight={600}>
            No AI providers configured
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Add an AI provider in settings to start chatting with the assistant.
          </Typography>
          <Button
            variant="contained"
            size="small"
            onClick={() => navigate('/app/settings/ai-providers')}
          >
            Open AI Provider Settings
          </Button>
        </Box>
      );
    }

    return <ChatMessageList sessionId={selectedSessionId} />;
  };

  return (
    <Paper
      elevation={1}
      sx={{
        height: '100%',
        minHeight: 0, // allow children to shrink and scroll
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 0,
        borderLeft: '1px solid',
        borderColor: 'divider',
        overflow: 'hidden',
      }}
    >
      {/* Chat Header with Session Management */}
      <Box
        sx={{
          px: 1,
          pyb: 0.5,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 0.5,
          minHeight: 32,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <Typography
          variant="caption"
          sx={{
            flexShrink: 0,
            fontSize: '0.75rem',
            fontWeight: 500,
            color: 'text.secondary',
          }}
        >
          AI Assistant (beta)
        </Typography>

        {/* Right side controls - Session Management + Close */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.25,
          }}
        >
          <NewChatButton
            onCreate={handleCreateNewSession}
            disabled={!projectId || isLoading}
            loading={isCreating}
          />

          <SessionHistoryButton
            sessions={sessions}
            selectedId={selectedSessionId}
            onSelect={handleSessionSelect}
            onDelete={handleSessionDelete}
            onRename={handleSessionRename}
            disabled={isLoading}
          />

          <Tooltip title="Close">
            <IconButton
              size="small"
              onClick={() => setIsChatOpen?.(false)}
              sx={{
                width: 24,
                height: 24,
                padding: 0.25,
              }}
            >
              <Close sx={{ fontSize: '0.875rem' }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Messages Area */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {renderMessages()}
      </Box>

      {/* Input Area */}
      <Box sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
        <ChatInputBox
          sessionId={selectedSessionId}
          contextManager={contextManager}
        />
      </Box>
    </Paper>
  );
};
