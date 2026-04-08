import React from 'react';
import { Box, Typography, Stack } from '@mui/material';
import ChatIcon from '@mui/icons-material/Chat';
import { useGetChatMessagesWithContext } from '../../controllers/chat.controller';
import { useGetAISettings } from '../../controllers/aiSettings.controller';
import { MessageRenderer } from './MessageRenderer';

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface ChatMessageListProps {
  sessionId?: number;
  lastUsage?: TokenUsage | null;
}

export const ChatMessageList: React.FC<ChatMessageListProps> = ({
  sessionId,
  lastUsage,
}) => {
  const { data: messages = [], isLoading } =
    useGetChatMessagesWithContext(sessionId);
  const { data: aiSettings } = useGetAISettings();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const bottomRef = React.useRef<HTMLDivElement | null>(null);

  const autoScroll = aiSettings?.chat?.autoScrollToLatest ?? true;

  // Helper to scroll to bottom
  type ScrollBehaviorType = 'auto' | 'smooth';
  const scrollToBottom = React.useCallback(
    (behavior: ScrollBehaviorType = 'smooth') => {
      if (!autoScroll) return;
      if (bottomRef.current) {
        bottomRef.current.scrollIntoView({ behavior, block: 'end' });
      } else if (containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
    },
    [autoScroll],
  );

  // Derive a key that changes when the last message content grows during streaming
  const lastMessageContentKey = React.useMemo(() => {
    if (!messages || messages.length === 0) return '';
    const last = messages[messages.length - 1];
    return `${last.id}:${last.content?.length ?? 0}`;
  }, [messages]);

  // Auto-scroll to bottom on new messages, session changes, and when the last
  // message content updates during streaming
  React.useEffect(() => {
    scrollToBottom('smooth');
  }, [messages.length, sessionId, lastMessageContentKey, scrollToBottom]);

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
          p: 2,
          backgroundColor: 'background.paper',
        }}
      >
        <Stack alignItems="center" spacing={1.25}>
          <ChatIcon sx={{ fontSize: 36, color: 'text.disabled' }} />
          <Typography variant="body1" color="text.secondary" align="center">
            Start a conversation
          </Typography>
          <Typography
            variant="caption"
            color="text.disabled"
            align="center"
            sx={{ maxWidth: 280 }}
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
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        px: 1,
        py: 1.5,
        pb: 1.5,
        overflowY: 'auto',
        gap: 0.75,
        backgroundColor: 'background.paper',
      }}
    >
      {isLoading && (
        <Typography variant="caption" color="text.disabled">
          Loading messages...
        </Typography>
      )}
      {!isLoading && messages.length === 0 && (
        <Typography variant="caption" color="text.disabled">
          No messages yet. Say hello!
        </Typography>
      )}
      <Stack spacing={0.75}>
        {messages.map((m) => (
          <MessageRenderer
            key={m.id}
            content={m.content || ''}
            role={m.role}
            contextItems={m.contextItems}
          />
        ))}
        {aiSettings?.chat?.showTokenCount && lastUsage && (
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{ pl: 0.5, pt: 0.25 }}
          >
            {lastUsage.totalTokens} tokens ({lastUsage.promptTokens} in /{' '}
            {lastUsage.completionTokens} out)
          </Typography>
        )}
        <div ref={bottomRef} />
      </Stack>
    </Box>
  );
};
