import React from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import StopIcon from '@mui/icons-material/Stop';
import { useQueryClient } from 'react-query';
import {
  useStreamChatMessage,
  useCancelChatStream,
} from '../../controllers/chat.controller';
import { QUERY_KEYS } from '../../config/constants';
import {
  useGetAIProviders,
  useGetActiveAIProvider,
  useSetActiveAIProvider,
  type AIProvider,
} from '../../controllers/aiProviders.controller';
import {
  aiProviderImages,
  defaultIcon,
} from '../../../../assets/connectionIcons';
import TipTapEditor from './TipTapEditor';

interface ChatInputBoxProps {
  sessionId?: number;
}

const ChatInputBox: React.FC<ChatInputBoxProps> = ({ sessionId }) => {
  const theme = useTheme();
  const [input, setInput] = React.useState('');

  const queryClient = useQueryClient();
  const assistantTempIdRef = React.useRef<number | null>(null);
  const userTempIdRef = React.useRef<number | null>(null);
  const { mutate: streamMessage, isLoading: isStreaming } =
    useStreamChatMessage();
  const { mutate: cancelStream, isLoading: isCancelling } =
    useCancelChatStream();
  const { data: providers = [] } = useGetAIProviders();
  const { data: activeProvider } = useGetActiveAIProvider();
  const { mutate: setActiveProvider, isLoading: switching } =
    useSetActiveAIProvider();

  const htmlToPlainText = React.useCallback((html: string) => {
    const div = document.createElement('div');
    div.innerHTML = html || '';
    // Normalize line breaks
    const text = div.textContent || div.innerText || '';
    return text.replace(/\u00A0/g, ' ').replace(/\s+$/g, '');
  }, []);

  const plainText = React.useMemo(
    () => htmlToPlainText(input),
    [input, htmlToPlainText],
  );

  const selectedProvider = React.useMemo(() => {
    const id = activeProvider?.id?.toString();
    return providers.find((p) => p.id?.toString() === id) || null;
  }, [providers, activeProvider]);

  const selectedIcon = React.useMemo(() => {
    if (!selectedProvider) return defaultIcon;
    const typeKey = selectedProvider.type as keyof typeof aiProviderImages;
    return aiProviderImages[typeKey] || defaultIcon;
  }, [selectedProvider]);

  const handleSend = () => {
    const content = plainText.trim();
    if (sessionId && content && activeProvider) {
      // 1) Optimistically add the user message locally (no server call here)
      // Must match the key used by useGetChatMessages(sessionId) which is
      // [QUERY_KEYS.GET_CHAT_MESSAGES, sessionId, undefined, undefined]
      const msgKey = [
        QUERY_KEYS.GET_CHAT_MESSAGES,
        sessionId,
        undefined,
        undefined,
      ] as const;
      const prev =
        queryClient.getQueryData<
          Array<{
            id: number;
            role: string;
            conversationId: number;
            content: string;
            createdAt: string;
            updatedAt: string;
            [k: string]: any;
          }>
        >(msgKey) || [];

      const tempUserId = -Date.now();
      const tempUser = {
        id: tempUserId,
        conversationId: sessionId,
        role: 'user',
        content,
        metadata: { temp: true },
        toolCalls: null as any,
        contextItems: null as any,
        thinkingContent: null as any,
        signature: null as any,
        isStreaming: false,
        parentMessageId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any;

      // 2) Track temp IDs and create a temporary assistant message to stream into
      userTempIdRef.current = tempUserId;
      const tempId = -Date.now() - 1;
      assistantTempIdRef.current = tempId;
      const tempAssistant = {
        id: tempId,
        conversationId: sessionId,
        role: 'assistant',
        content: 'Generating…',
        metadata: { temp: true, isStreaming: true },
        toolCalls: null as any,
        contextItems: null as any,
        thinkingContent: null as any,
        signature: null as any,
        isStreaming: true,
        parentMessageId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any;
      // Push both temp user and temp assistant
      queryClient.setQueryData(msgKey, [...prev, tempUser, tempAssistant]);

      // Clear input immediately
      setInput('');

      // 3) Start streaming; update the temp assistant content on each chunk
      streamMessage(
        {
          sessionId,
          content,
          onChunk: (chunk: string) => {
            const current = queryClient.getQueryData<typeof prev>(msgKey) || [];
            queryClient.setQueryData(
              msgKey,
              current.map((m) =>
                m.id === assistantTempIdRef.current
                  ? {
                      ...m,
                      content:
                        (m.content === 'Generating…' ? '' : m.content) + chunk,
                      updatedAt: new Date().toISOString(),
                    }
                  : m,
              ),
            );
          },
        },
        {
          onSuccess: async () => {
            // Replace temp with persisted messages (use exact same key signature)
            await queryClient.invalidateQueries(msgKey);
            assistantTempIdRef.current = null;
            userTempIdRef.current = null;
          },
          onError: async (error: any) => {
            const current = queryClient.getQueryData<typeof prev>(msgKey) || [];
            const aId = assistantTempIdRef.current;
            if (error?.message === 'aborted') {
              // Cancelled by user: remove only the temp assistant and refresh to reconcile persisted user message
              queryClient.setQueryData(
                msgKey,
                current.filter((m) => m.id !== aId),
              );
              assistantTempIdRef.current = null;
              await queryClient.invalidateQueries(msgKey);
              // Clear user temp ref after refresh
              userTempIdRef.current = null;
            } else {
              // Real error: remove both temp assistant and temp user
              const uId = userTempIdRef.current;
              queryClient.setQueryData(
                msgKey,
                current.filter((m) => m.id !== aId && m.id !== uId),
              );
              assistantTempIdRef.current = null;
              userTempIdRef.current = null;
            }
          },
        },
      );
    }
  };

  const handleCancel = () => {
    if (!sessionId) return;
    const msgKey = [
      QUERY_KEYS.GET_CHAT_MESSAGES,
      sessionId,
      undefined,
      undefined,
    ] as const;

    cancelStream(
      { sessionId },
      {
        onSettled: async () => {
          // Remove only the temp streaming assistant; keep user and refresh to persist
          const current =
            queryClient.getQueryData<
              Array<{
                id: number;
                [k: string]: any;
              }>
            >(msgKey) || [];
          const aId = assistantTempIdRef.current;
          queryClient.setQueryData(
            msgKey,
            current.filter((m) => m.id !== aId),
          );
          assistantTempIdRef.current = null;
          await queryClient.invalidateQueries(msgKey);
          // Clear user temp ref after refresh
          userTempIdRef.current = null;
        },
      },
    );
  };

  // Note: Enter-to-send is implemented in TipTapEditor via onSubmit (Enter) and Shift+Enter for newline.

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      <Box
        sx={{
          p: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            minHeight: 36,
            maxHeight: 120,
            overflow: 'auto',
          }}
        >
          <TipTapEditor
            value={input}
            onChange={setInput}
            placeholder="Type a message..."
            disabled={isStreaming}
            onSubmit={handleSend}
          />
        </Box>
      </Box>
      <Box
        sx={{
          px: 1.5,
          pb: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
        }}
      >
        <select
          id="ai-provider-select"
          value={activeProvider?.id?.toString() ?? ''}
          onChange={(e) => {
            const id = e.target.value as string;
            if (id) setActiveProvider(id);
          }}
          disabled={switching || isStreaming}
          style={{
            height: 22,
            fontSize: 11,
            padding: '1px 6px 1px 26px',
            borderRadius: 4,
            border: `1px solid ${theme.palette.divider}`,
            background: `${theme.palette.background.paper} url(${selectedIcon}) 6px center / 14px 14px no-repeat`,
            color: theme.palette.text.primary,
            maxWidth: 220,
          }}
        >
          <option value="">No AI Provider</option>
          {providers.map((p: AIProvider) => (
            <option key={p.id} value={p.id?.toString() ?? ''}>
              {p.name}
            </option>
          ))}
        </select>
        <Box sx={{ flex: 1 }} />
        {isStreaming && (
          <span style={{ fontSize: 11, color: theme.palette.text.disabled }}>
            Generating…
          </span>
        )}
        {(() => {
          if (isStreaming) {
            return (
              <Tooltip
                title="Stop generation"
                placement="top"
                arrow
                disableInteractive
              >
                <span>
                  <IconButton
                    color="primary"
                    size="small"
                    onClick={handleCancel}
                    disabled={isCancelling}
                    aria-label="Stop generation"
                    sx={{
                      bgcolor: 'primary.main',
                      color: 'primary.contrastText',
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      p: 0,
                      ml: 'auto',
                      '&:hover': { bgcolor: 'primary.dark' },
                      '&:disabled': {
                        bgcolor: 'action.disabledBackground',
                        color: 'action.disabled',
                      },
                    }}
                  >
                    <StopIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            );
          }

          const sendDisabled =
            !sessionId || !plainText.trim() || !activeProvider;
          let tooltipTitle = 'Send message (Enter)';
          if (!activeProvider) tooltipTitle = 'Select an AI provider to send';
          else if (!sessionId) tooltipTitle = 'Open or create a chat session';
          else if (!plainText.trim())
            tooltipTitle = 'Type a message to enable send';

          return (
            <Tooltip
              title={tooltipTitle}
              placement="top"
              arrow
              disableInteractive
            >
              <span>
                <IconButton
                  color="primary"
                  size="small"
                  onClick={handleSend}
                  disabled={sendDisabled}
                  aria-label="Send message"
                  sx={{
                    bgcolor: 'primary.main',
                    color: 'primary.contrastText',
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    p: 0,
                    ml: 'auto',
                    '&:hover': {
                      bgcolor: 'primary.dark',
                    },
                    '&:disabled': {
                      bgcolor: 'action.disabledBackground',
                      color: 'action.disabled',
                    },
                  }}
                >
                  <ArrowUpwardIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          );
        })()}
      </Box>
    </Box>
  );
};

export default ChatInputBox;
