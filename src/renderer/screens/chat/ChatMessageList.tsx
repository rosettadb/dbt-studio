import React from 'react';
import { Box, Typography, Stack } from '@mui/material';
import ChatIcon from '@mui/icons-material/Chat';
import { useGetChatMessages } from '../../controllers/chat.controller';
import { MessageRenderer } from './MessageRenderer';

interface ChatMessageListProps {
  sessionId?: number;
}

const ChatMessageList: React.FC<ChatMessageListProps> = ({ sessionId }) => {
  const { data: messages = [], isLoading } = useGetChatMessages(sessionId);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const bottomRef = React.useRef<HTMLDivElement | null>(null);

  // Helper to scroll to bottom
  type ScrollBehaviorType = 'auto' | 'smooth';
  const scrollToBottom = React.useCallback(
    (behavior: ScrollBehaviorType = 'smooth') => {
      if (bottomRef.current) {
        bottomRef.current.scrollIntoView({ behavior, block: 'end' });
      } else if (containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
    },
    [],
  );

  // Auto-scroll to bottom on new messages and session changes
  React.useEffect(() => {
    scrollToBottom('smooth');
  }, [messages.length, sessionId, scrollToBottom]);

  // Keep scrolled to bottom on container resize (layout changes)
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      // Use instant jump to avoid jitter on continuous resizing
      scrollToBottom('auto');
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [scrollToBottom]);

  if (!sessionId) {
    return (
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 3,
        }}
      >
        <Stack alignItems="center" spacing={2}>
          <ChatIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
          <Typography variant="h6" color="text.secondary" align="center">
            Start a conversation
          </Typography>
          <Typography
            variant="body2"
            color="text.disabled"
            align="center"
            sx={{ maxWidth: 300 }}
          >
            Ask questions about your dbt project, get help with SQL, or discuss
            your data models.
          </Typography>
        </Stack>
      </Box>
    );
  }

  return (
    <Box
      ref={containerRef}
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        px: 1,
        py: 2,
        pb: 2,
        overflowY: 'auto',
        gap: 1,
      }}
    >
      {isLoading && (
        <Typography variant="body2" color="text.disabled">
          Loading messages...
        </Typography>
      )}
      {!isLoading && messages.length === 0 && (
        <Typography variant="body2" color="text.disabled">
          No messages yet. Say hello!
        </Typography>
      )}
      <Stack spacing={1}>
        {messages.map((m) => (
          <MessageRenderer key={m.id} content={m.content || ''} role={m.role} />
        ))}
        <div ref={bottomRef} />
      </Stack>
    </Box>
  );
};

export default ChatMessageList;
