import React from 'react';
import {
  Box,
  Typography,
  Stack,
  Divider,
  CircularProgress,
} from '@mui/material';
import ChatIcon from '@mui/icons-material/Chat';
import { useGetChatMessagesWithContext } from '../../controllers/chat.controller';
import { useGetAISettings } from '../../controllers/aiSettings.controller';
import { MessageRenderer } from './MessageRenderer';
import { ToolCallRow } from './ToolCallRow';
import { TerminalConfirmBanner } from './TerminalConfirmBanner';
import { AgentErrorAlert } from './AgentErrorAlert';
import { subscribeToContextCompacted } from '../../services/agentEvents.service';
import type {
  AgentStreamState,
  ToolCallContentPart,
} from '../../hooks/useAgentStream';

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface ChatMessageListProps {
  sessionId?: number;
  lastUsage?: TokenUsage | null;
  streamState?: AgentStreamState;
  isAgentRunning?: boolean;
  onConfirmTerminal?: (allow: boolean) => void;
  onClearError?: () => void;
  onOpenFile?: (path: string) => void;
}

export const ChatMessageList: React.FC<ChatMessageListProps> = ({
  sessionId,
  lastUsage,
  streamState,
  isAgentRunning,
  onConfirmTerminal,
  onClearError,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onOpenFile,
}) => {
  const { data: messages = [], isLoading } =
    useGetChatMessagesWithContext(sessionId);
  const { data: aiSettings } = useGetAISettings();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const bottomRef = React.useRef<HTMLDivElement | null>(null);

  // Track whether auto-compaction fired during this session
  const [compactionInfo, setCompactionInfo] = React.useState<{
    messagesSummarized: number;
  } | null>(null);

  // Reset compaction divider when session changes
  React.useEffect(() => {
    setCompactionInfo(null);
  }, [sessionId]);

  // Subscribe to compaction events (FE-03 compliant — service layer, not raw ipcRenderer)
  React.useEffect(() => {
    if (!sessionId) return undefined;
    const unsub = subscribeToContextCompacted((data) => {
      if (data.conversationId !== sessionId) return;
      setCompactionInfo({ messagesSummarized: data.messagesSummarized });
    });
    return unsub;
  }, [sessionId]);

  const autoScroll = aiSettings?.chat?.autoScrollToLatest ?? true;
  const hasPersistedCompaction = React.useMemo(
    () =>
      messages.some(
        (m) => m.role === 'system' && (m.metadata as any)?.compacted,
      ),
    [messages],
  );

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
    if (isAgentRunning && streamState?.contentParts.length) {
      return `streaming:${streamState.contentParts.length}:${streamState.currentText.length}`;
    }
    if (!messages || messages.length === 0) return '';
    const last = messages[messages.length - 1];
    return `${last.id}:${last.content?.length ?? 0}`;
  }, [
    messages,
    isAgentRunning,
    streamState?.contentParts.length,
    streamState?.currentText.length,
  ]);

  // Auto-scroll to bottom on new messages, session changes, and when the last
  // message content updates during streaming
  React.useEffect(() => {
    scrollToBottom('smooth');
  }, [
    messages.length,
    sessionId,
    lastMessageContentKey,
    scrollToBottom,
    streamState?.pendingConfirm,
  ]);

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
        py: 0.5,
        pb: 0.5,
        overflowY: 'auto',
        gap: 1,
        backgroundColor: 'background.paper',
      }}
    >
      {isLoading && (
        <Typography variant="caption" color="text.disabled">
          Loading messages...
        </Typography>
      )}
      {!isLoading && messages.length === 0 && !isAgentRunning && (
        <Typography variant="caption" color="text.disabled">
          No messages yet. Say hello!
        </Typography>
      )}
      <Stack spacing={0.25} sx={{ minWidth: 0, overflowX: 'hidden', px: 1.5 }}>
        {messages.map((m, index) => {
          if (m.role === 'system' && (m.metadata as any)?.compacted) {
            const summarizedCount =
              (m.metadata as any)?.summarizedMessageCount ??
              compactionInfo?.messagesSummarized;
            return (
              <Box
                key={m.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  my: 0.5,
                  opacity: 0.55,
                }}
              >
                <Divider sx={{ flex: 1 }} />
                <Typography
                  variant="caption"
                  sx={{
                    mx: 1.5,
                    color: 'text.disabled',
                    fontSize: '0.65rem',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Earlier conversation summarized
                  {summarizedCount ? ` (${summarizedCount} messages)` : ''}
                </Typography>
                <Divider sx={{ flex: 1 }} />
              </Box>
            );
          }

          const isLastMessage = index === messages.length - 1;
          const persistedUsage =
            m.metadata?.promptTokens ||
            m.metadata?.completionTokens ||
            m.metadata?.totalTokens
              ? {
                  promptTokens: m.metadata?.promptTokens ?? 0,
                  completionTokens: m.metadata?.completionTokens ?? 0,
                  totalTokens: m.metadata?.totalTokens ?? 0,
                }
              : null;
          return (
            <React.Fragment key={m.id}>
              <MessageRenderer
                messageId={m.id}
                content={m.content || ''}
                role={m.role}
                contextItems={m.contextItems}
                toolCalls={m.toolCalls?.length > 0 ? m.toolCalls : undefined}
                reasoning={
                  (m as any).reasoning ||
                  (m.thinkingContent ? { text: m.thinkingContent } : undefined)
                }
                isStreaming={false}
                tokenUsage={
                  persistedUsage ||
                  (isLastMessage && m.role === 'assistant' ? lastUsage : null)
                }
                showTokenCount={aiSettings?.chat?.showTokenCount}
                orderedParts={m.metadata?.orderedParts}
              />
            </React.Fragment>
          );
        })}

        {/* Compaction divider — shown when auto-compaction fired this session */}
        {compactionInfo && !hasPersistedCompaction && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              my: 0.5,
              opacity: 0.55,
            }}
          >
            <Divider sx={{ flex: 1 }} />
            <Typography
              variant="caption"
              sx={{
                mx: 1.5,
                color: 'text.disabled',
                fontSize: '0.65rem',
                whiteSpace: 'nowrap',
              }}
            >
              Earlier conversation summarized (
              {compactionInfo.messagesSummarized} messages)
            </Typography>
            <Divider sx={{ flex: 1 }} />
          </Box>
        )}

        {/* Spinner — shown while streaming starts and no content yet */}
        {isAgentRunning &&
          (streamState?.contentParts.length ?? 0) === 0 &&
          (() => {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg?.role !== 'user') return null;
            return (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 0.5,
                  py: 0.5,
                  color: 'text.disabled',
                }}
              >
                <CircularProgress size={10} color="inherit" />
                <Typography variant="caption" color="text.disabled">
                  Working…
                </Typography>
              </Box>
            );
          })()}

        {/* Live interleaved stream — text parts + tool-call parts in arrival order */}
        {(streamState?.contentParts.length ?? 0) > 0 &&
          (() => {
            // Hide once the run is fully persisted (DB message with tool calls loaded)
            const lastMsg = messages[messages.length - 1];
            const alreadyPersisted =
              !isAgentRunning &&
              lastMsg?.role === 'assistant' &&
              lastMsg?.toolCalls?.length > 0;
            if (alreadyPersisted) return null;

            return (
              <Box sx={{ mt: 0.25 }}>
                {streamState!.contentParts.map((part, idx) => {
                  if (part.type === 'text') {
                    // Only render non-empty text parts
                    if (!part.text) return null;
                    const assistantRole = 'assistant' as const;
                    return (
                      <MessageRenderer
                        // eslint-disable-next-line react/no-array-index-key
                        key={`live-text-${idx}`}
                        messageId={-1}
                        role={assistantRole}
                        content={part.text}
                        isStreaming={!!isAgentRunning}
                      />
                    );
                  }
                  // tool-call part
                  const tc = part as ToolCallContentPart;
                  return (
                    <ToolCallRow
                      key={tc.toolCallId}
                      toolCall={{
                        id: tc.toolCallId,
                        toolName: tc.toolName,
                        args: tc.args,
                        result: tc.result,
                        error: tc.error,
                        status: tc.status,
                        durationMs: tc.durationMs,
                      }}
                    />
                  );
                })}
              </Box>
            );
          })()}

        {/* Terminal confirmation banner — below the streaming text */}
        {streamState?.pendingConfirm && onConfirmTerminal && (
          <TerminalConfirmBanner
            request={streamState.pendingConfirm}
            onAllow={() => onConfirmTerminal(true)}
            onDeny={() => onConfirmTerminal(false)}
          />
        )}

        {/* Inline agent error alert */}
        {streamState?.error && onClearError && (
          <AgentErrorAlert error={streamState.error} onDismiss={onClearError} />
        )}

        <div ref={bottomRef} />
      </Stack>
    </Box>
  );
};
