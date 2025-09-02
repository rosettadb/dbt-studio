import React from 'react';
import { Box, Paper, IconButton, Tooltip, Typography } from '@mui/material';
import { Close } from '@mui/icons-material';
import { useAppContext } from '../../hooks';
import { useGetSelectedProject } from '../../controllers';
import {
  useCreateChatSession,
  useGetChatSessions,
} from '../../controllers/chat.controller';
import ChatMessageList from './ChatMessageList';
import ChatInputBox from './ChatInputBox';

const ChatWindow: React.FC = () => {
  const { setIsChatOpen } = useAppContext();
  const { data: project } = useGetSelectedProject();
  const projectId = project?.id as number | undefined;

  const [selectedSessionId, setSelectedSessionId] = React.useState<number>();

  const { data: sessions = [], isLoading } = useGetChatSessions(projectId);
  const { mutate: createSession } = useCreateChatSession({
    onSuccess: (session) =>
      setSelectedSessionId(session.id as unknown as number),
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
      {/* Chat Header */}
      <Box
        sx={{
          p: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Typography sx={{ mt: '2px' }}>AI Assistant (Beta)</Typography>
        <Tooltip title="Close">
          <IconButton size="small" onClick={() => setIsChatOpen?.(false)}>
            <Close fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Messages Area */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <ChatMessageList sessionId={selectedSessionId} />
      </Box>

      {/* Input Area */}
      <Box sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
        <ChatInputBox sessionId={selectedSessionId} />
      </Box>
    </Paper>
  );
};

export default ChatWindow;
