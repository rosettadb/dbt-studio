import React from 'react';
import {
  Box,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import StopIcon from '@mui/icons-material/Stop';
import QuestionAnswerOutlinedIcon from '@mui/icons-material/QuestionAnswerOutlined';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import AddIcon from '@mui/icons-material/Add';
import { useQueryClient } from 'react-query';
import { toast } from 'react-toastify';
import { FilePickerModal } from './FilePickerModal';
import {
  useStreamChatMessage,
  useCancelChatStream,
} from '../../controllers/chat.controller';
import {
  useRunAgent,
  useCancelAgent,
} from '../../controllers/agent.controller';
import { useGetAISettings } from '../../controllers/aiSettings.controller';
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
import { TipTapEditor } from './TipTapEditor';
import { ContextTabs } from './ContextTabs';
import { useAutoRenameSession } from '../../hooks/useAutoRenameSession';
import { htmlToPlainText } from '../../utils/chatHelpers';
import { useAppContext } from '../../hooks';
import { useContextManager } from '../../hooks/useContextManager';
import { useAgentMode } from '../../hooks/useAgentMode';
import {
  subscribeToAgentToolCalls,
  subscribeToChatStreamChunks,
} from '../../services/agentEvents.service';

interface ChatInputBoxProps {
  sessionId?: number;
  contextManager?: ReturnType<typeof useContextManager>;
  projectPath?: string;
  onUsage?: (usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }) => void;
}

export const ChatInputBox: React.FC<ChatInputBoxProps> = ({
  sessionId,
  contextManager,
  projectPath,
  onUsage,
}) => {
  const theme = useTheme();
  const [input, setInput] = React.useState('');
  const [isFilePickerOpen, setIsFilePickerOpen] = React.useState(false);
  const [modeMenuAnchor, setModeMenuAnchor] =
    React.useState<null | HTMLElement>(null);
  const [providerMenuAnchor, setProviderMenuAnchor] =
    React.useState<null | HTMLElement>(null);

  const { pendingMessage, setPendingMessage, setEditingFilePath } =
    useAppContext();

  // Use provided context manager or create a fallback
  const fallbackContextManager = useContextManager();
  const activeContextManager = contextManager || fallbackContextManager;

  const queryClient = useQueryClient();
  const assistantTempIdRef = React.useRef<number | null>(null);
  const userTempIdRef = React.useRef<number | null>(null);
  const lastAgentWrittenFileRef = React.useRef<string | null>(null);
  const agentStreamUnsubscribeRef = React.useRef<null | (() => void)>(null);
  const agentToolCallsUnsubscribeRef = React.useRef<null | (() => void)>(null);

  // Agent mode state
  const { isAgentMode, setAgentMode } = useAgentMode(sessionId);

  // Chat and agent mutations
  const { mutate: streamMessage, isLoading: isStreaming } =
    useStreamChatMessage();
  const { mutate: cancelStream, isLoading: isCancelling } =
    useCancelChatStream();
  const { mutate: runAgent, isLoading: isAgentRunning } = useRunAgent();
  const { mutate: cancelAgent, isLoading: isAgentCancelling } =
    useCancelAgent();
  const { data: aiSettings } = useGetAISettings();

  const { data: providers = [] } = useGetAIProviders();
  const { data: activeProvider } = useGetActiveAIProvider();
  const { mutate: setActiveProvider, isLoading: switching } =
    useSetActiveAIProvider();

  // Combined loading state for both chat and agent modes
  const isLoading = isStreaming || isAgentRunning;
  const isCanceling = isCancelling || isAgentCancelling;

  // Auto-rename session hook
  const { autoRename } = useAutoRenameSession(sessionId);

  // Use the utility function instead of inline implementation
  const plainText = React.useMemo(() => htmlToPlainText(input), [input]);

  const selectedProvider = React.useMemo(() => {
    const id = activeProvider?.id?.toString();
    return providers.find((p) => p.id?.toString() === id) || null;
  }, [providers, activeProvider]);

  const selectedIcon = React.useMemo(() => {
    if (!selectedProvider) return defaultIcon;
    const typeKey = selectedProvider.type as keyof typeof aiProviderImages;
    return aiProviderImages[typeKey] || defaultIcon;
  }, [selectedProvider]);

  const handleSendChatMessage = async (messageContent: string) => {
    if (!sessionId) return;

    // 1) Optimistically add the user message locally (no server call here)
    // Must match the key used by useGetChatMessagesWithContext(sessionId) which is
    // [QUERY_KEYS.GET_CHAT_MESSAGES_WITH_CONTEXT, sessionId, undefined, undefined]
    const msgKey = [
      QUERY_KEYS.GET_CHAT_MESSAGES_WITH_CONTEXT,
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
      content: messageContent,
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

    // 3) Prepare context items using context manager
    const rawContextItems =
      await activeContextManager.getContextItemsWithAdditionalFiles();
    const contextItems =
      aiSettings?.chat?.autoIncludeFileContext !== false ? rawContextItems : [];

    streamMessage(
      {
        sessionId,
        content: messageContent,
        contextItems: contextItems.length > 0 ? contextItems : undefined,
        onChunk: (chunk: string) => {
          const current =
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
        onDone: (usage) => {
          if (usage && onUsage) onUsage(usage);
        },
      },
      {
        onSuccess: async () => {
          // Replace temp with persisted messages (use exact same key signature)
          await queryClient.invalidateQueries(msgKey);

          // Auto-rename session after successful LLM response
          // Use the user's message content to generate a descriptive title
          autoRename(messageContent);

          // Clear context after successful send
          activeContextManager.clearAdditionalFiles();

          assistantTempIdRef.current = null;
          userTempIdRef.current = null;
          lastAgentWrittenFileRef.current = null;
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
            // No toast for user cancellation
          } else {
            // Real error: remove both temp assistant and temp user
            const uId = userTempIdRef.current;
            queryClient.setQueryData(
              msgKey,
              current.filter((m) => m.id !== aId && m.id !== uId),
            );
            assistantTempIdRef.current = null;
            userTempIdRef.current = null;

            // Show appropriate error message
            if (
              error?.message?.includes('401') ||
              error?.message?.includes('unauthorized')
            ) {
              toast.error(
                'Authentication failed. Please check your AI provider credentials.',
              );
            } else if (
              error?.message?.includes('429') ||
              error?.message?.includes('quota')
            ) {
              toast.error('Rate limit exceeded. Please try again later.');
            } else if (
              error?.message?.includes('network') ||
              error?.message?.includes('fetch')
            ) {
              toast.error(
                'Network error. Please check your connection and try again.',
              );
            } else {
              toast.error(
                `Failed to send message: ${error?.message || 'Unknown error'}`,
              );
            }
          }
        },
      },
    );
  };

  const handleSendAgentMessage = async (messageContent: string) => {
    if (!sessionId) return;

    const msgKey = [
      QUERY_KEYS.GET_CHAT_MESSAGES_WITH_CONTEXT,
      sessionId,
      undefined,
      undefined,
    ] as const;
    const prev = queryClient.getQueryData<Array<any>>(msgKey) || [];

    const tempUserId = -Date.now();
    const tempUser = {
      id: tempUserId,
      conversationId: sessionId,
      role: 'user',
      content: messageContent,
      metadata: { temp: true, agentMode: true },
      toolCalls: null as any,
      contextItems: null as any,
      thinkingContent: null as any,
      signature: null as any,
      isStreaming: false,
      parentMessageId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any;

    userTempIdRef.current = tempUserId;
    const tempId = -Date.now() - 1;
    assistantTempIdRef.current = tempId;
    const tempAssistant = {
      id: tempId,
      conversationId: sessionId,
      role: 'assistant',
      content: '🤖 Agent working…',
      metadata: { temp: true, isStreaming: true, agentMode: true },
      toolCalls: null as any,
      contextItems: null as any,
      thinkingContent: null as any,
      signature: null as any,
      isStreaming: true,
      parentMessageId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any;

    queryClient.setQueryData(msgKey, [...prev, tempUser, tempAssistant]);
    setInput('');

    // Set up streaming listener for agent responses (uses same event as chat)
    const unsubscribe = subscribeToChatStreamChunks((data) => {
      if (data && data.conversationId === sessionId) {
        const current = queryClient.getQueryData<Array<any>>(msgKey) || [];
        queryClient.setQueryData(
          msgKey,
          current.map((m) =>
            m.id === assistantTempIdRef.current
              ? {
                  ...m,
                  content:
                    (m.content === '🤖 Agent working…' ? '' : m.content) +
                    data.chunk,
                  updatedAt: new Date().toISOString(),
                }
              : m,
          ),
        );
      }
    });
    agentStreamUnsubscribeRef.current = unsubscribe;

    const unsubscribeToolCalls = subscribeToAgentToolCalls((data) => {
      if (!data || data.conversationId !== sessionId) {
        return;
      }

      if (data.toolName !== 'writeFile' && data.toolName !== 'writeDbtModel') {
        return;
      }

      const filePath = (data.args as any)?.filePath;
      if (typeof filePath === 'string' && filePath.length > 0) {
        lastAgentWrittenFileRef.current = filePath;
      }
    });
    agentToolCallsUnsubscribeRef.current = unsubscribeToolCalls;

    const rawAgentContextItems =
      await activeContextManager.getContextItemsWithAdditionalFiles();
    const agentContextItems =
      aiSettings?.chat?.autoIncludeFileContext !== false
        ? rawAgentContextItems
        : [];

    runAgent(
      {
        conversationId: sessionId,
        content: messageContent,
        contextItems:
          agentContextItems.length > 0 ? agentContextItems : undefined,
        projectPath,
      },
      {
        onSuccess: async () => {
          unsubscribe();
          unsubscribeToolCalls();
          agentStreamUnsubscribeRef.current = null;
          agentToolCallsUnsubscribeRef.current = null;
          await queryClient.invalidateQueries(msgKey);

          if (projectPath) {
            await queryClient.invalidateQueries([
              QUERY_KEYS.GET_FILE_STRUCTURE,
              projectPath,
            ]);
            await queryClient.invalidateQueries([
              QUERY_KEYS.GIT_STATUSES,
              projectPath,
            ]);
          } else {
            await queryClient.invalidateQueries([
              QUERY_KEYS.GET_FILE_STRUCTURE,
            ]);
            await queryClient.invalidateQueries([QUERY_KEYS.GIT_STATUSES]);
          }

          if (lastAgentWrittenFileRef.current) {
            setEditingFilePath(lastAgentWrittenFileRef.current);
          }

          autoRename(messageContent);
          activeContextManager.clearAdditionalFiles();
          assistantTempIdRef.current = null;
          userTempIdRef.current = null;
          lastAgentWrittenFileRef.current = null;
        },
        onError: async (error: any) => {
          unsubscribe();
          unsubscribeToolCalls();
          agentStreamUnsubscribeRef.current = null;
          agentToolCallsUnsubscribeRef.current = null;
          const current = queryClient.getQueryData<typeof prev>(msgKey) || [];
          const aId = assistantTempIdRef.current;
          const uId = userTempIdRef.current;

          queryClient.setQueryData(
            msgKey,
            current.filter((m) => m.id !== aId && m.id !== uId),
          );
          assistantTempIdRef.current = null;
          userTempIdRef.current = null;
          lastAgentWrittenFileRef.current = null;

          // Extract the real error message from nested AI SDK error chain
          const extractMessage = (err: any): string => {
            // RetryError wraps the last real error
            if (err?.lastError) return extractMessage(err.lastError);
            // APICallError has the actual API message
            if (err?.responseBody) {
              try {
                const body = JSON.parse(err.responseBody);
                const msg = body?.error?.message;
                if (msg) return msg.split('\n')[0]; // first line only
              } catch {
                // ignore
              }
            }
            return err?.message || 'Unknown error';
          };

          const msg = extractMessage(error);

          if (
            msg.includes('quota') ||
            msg.includes('429') ||
            msg.includes('RESOURCE_EXHAUSTED') ||
            error?.statusCode === 429
          ) {
            toast.error(
              'Rate limit exceeded. Please check your API quota or switch to a different provider.',
            );
          } else if (
            msg.includes('401') ||
            msg.includes('unauthorized') ||
            msg.includes('API key')
          ) {
            toast.error(
              'Authentication failed. Please check your AI provider credentials.',
            );
          } else if (msg.includes('No output generated')) {
            toast.error(
              'Agent failed to generate a response. This may be due to a rate limit or API error. Please try again.',
            );
          } else {
            toast.error(`Agent error: ${msg}`);
          }
        },
      },
    );
  };

  const handleSendMessage = async (content?: string) => {
    const messageContent = content || plainText.trim();
    if (sessionId && messageContent && activeProvider) {
      // Use agent mode if enabled, otherwise use regular chat
      if (isAgentMode) {
        await handleSendAgentMessage(messageContent);
      } else {
        await handleSendChatMessage(messageContent);
      }
    }
  };

  const handleSend = async () => {
    await handleSendMessage();
  };

  const handleCancel = () => {
    if (!sessionId) return;
    const msgKey = [
      QUERY_KEYS.GET_CHAT_MESSAGES_WITH_CONTEXT,
      sessionId,
      undefined,
      undefined,
    ] as const;

    if (isAgentMode) {
      cancelAgent(sessionId, {
        onSettled: async () => {
          agentStreamUnsubscribeRef.current?.();
          agentToolCallsUnsubscribeRef.current?.();
          agentStreamUnsubscribeRef.current = null;
          agentToolCallsUnsubscribeRef.current = null;
          const current = queryClient.getQueryData<Array<any>>(msgKey) || [];
          const aId = assistantTempIdRef.current;
          queryClient.setQueryData(
            msgKey,
            current.filter((m) => m.id !== aId),
          );
          assistantTempIdRef.current = null;
          await queryClient.invalidateQueries(msgKey);
          userTempIdRef.current = null;
          lastAgentWrittenFileRef.current = null;
        },
      });
    } else {
      cancelStream(
        { sessionId },
        {
          onSettled: async () => {
            const current = queryClient.getQueryData<Array<any>>(msgKey) || [];
            const aId = assistantTempIdRef.current;
            queryClient.setQueryData(
              msgKey,
              current.filter((m) => m.id !== aId),
            );
            assistantTempIdRef.current = null;
            await queryClient.invalidateQueries(msgKey);
            userTempIdRef.current = null;
          },
        },
      );
    }
  };

  React.useEffect(() => {
    if (pendingMessage && sessionId && activeProvider && !isStreaming) {
      setTimeout(() => {
        handleSendMessage(pendingMessage);
        setPendingMessage(null);
        setInput('');
      }, 500);
    }
  }, [pendingMessage, sessionId, activeProvider, isStreaming]);

  const [isDragOver, setIsDragOver] = React.useState(false);

  const handleDrop = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const filePath =
        e.dataTransfer.getData('application/x-file-path') ||
        e.dataTransfer.getData('text/plain');
      if (!filePath) return;
      const name = filePath.split('/').pop() ?? filePath;
      const alreadyAdded = activeContextManager.additionalFiles.some(
        (f) => f.path === filePath,
      );
      if (!alreadyAdded) {
        activeContextManager.addFiles([
          { path: filePath, name, relativePath: name, fileType: 'other' },
        ]);
      }
    },
    [activeContextManager],
  );

  return (
    <Box
      sx={{ display: 'flex', flexDirection: 'column', position: 'relative' }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            zIndex: 10,
            border: '2px dashed',
            borderColor: 'primary.main',
            borderRadius: 1,
            bgcolor: 'action.hover',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <Box sx={{ color: 'primary.main', fontSize: 12 }}>
            Drop to add to context
          </Box>
        </Box>
      )}
      {/* Context file chips (manually added files only) */}
      {activeContextManager.additionalFiles.length > 0 && (
        <ContextTabs contextManager={activeContextManager} />
      )}

      <Box
        sx={{
          px: 1,
          py: 0.25,
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
            maxHeight: '40vh',
            overflow: 'auto',
            borderRadius: theme.spacing(0.75),
          }}
        >
          <TipTapEditor
            value={input}
            onChange={setInput}
            placeholder="Type a message..."
            disabled={isLoading}
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
        {/* + button to add context files */}
        <Tooltip title="Add context..." placement="top" arrow enterDelay={500}>
          <IconButton
            size="small"
            onClick={() => setIsFilePickerOpen(true)}
            sx={{
              width: 20,
              height: 20,
              color: 'text.secondary',
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 0.5,
              '&:hover': {
                color: 'text.primary',
                bgcolor: 'action.hover',
                borderColor: 'text.secondary',
              },
            }}
          >
            <AddIcon sx={{ fontSize: '0.8rem' }} />
          </IconButton>
        </Tooltip>

        <FilePickerModal
          open={isFilePickerOpen}
          onClose={() => setIsFilePickerOpen(false)}
          onSelect={(selectedFiles) => {
            const currentPaths = activeContextManager.additionalFiles.map(
              (f) => f.path,
            );
            const toAdd = selectedFiles
              .filter((f) => !currentPaths.includes(f.path))
              .map((f) => ({ ...f, fileType: f.fileType ?? 'other' }));
            if (toAdd.length > 0) activeContextManager.addFiles(toAdd);
            setIsFilePickerOpen(false);
          }}
          selectedFiles={activeContextManager.additionalFiles.map(
            (f) => f.path,
          )}
          excludeFiles={activeContextManager.additionalFiles.map((f) => f.path)}
        />

        {/* Agent/Chat Mode Selector - Custom Dropdown */}
        <Box
          onClick={(e) => !isLoading && setModeMenuAnchor(e.currentTarget)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.25,
            position: 'relative',
            borderRadius: 0.5,
            px: 0.5,
            py: 0.125,
            border: '1px solid',
            borderColor: 'divider',
            cursor: isLoading ? 'default' : 'pointer',
            '&:hover': {
              bgcolor: isLoading ? 'transparent' : 'action.hover',
            },
          }}
        >
          {isAgentMode ? (
            <CodeOutlinedIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
          ) : (
            <QuestionAnswerOutlinedIcon
              sx={{ fontSize: 14, color: 'text.secondary' }}
            />
          )}
          <Typography
            variant="caption"
            sx={{
              fontSize: 11,
              color: 'text.primary',
              userSelect: 'none',
            }}
          >
            {isAgentMode ? 'Code' : 'Ask'}
          </Typography>
        </Box>

        <Menu
          anchorEl={modeMenuAnchor}
          open={Boolean(modeMenuAnchor)}
          onClose={() => setModeMenuAnchor(null)}
          anchorOrigin={{
            vertical: 'top',
            horizontal: 'left',
          }}
          transformOrigin={{
            vertical: 'bottom',
            horizontal: 'left',
          }}
          PaperProps={{
            sx: {
              mt: -0.5,
              minWidth: 200,
            },
          }}
          MenuListProps={{
            sx: {
              py: 0.5,
            },
          }}
        >
          <MenuItem
            selected={!isAgentMode}
            onClick={() => {
              setAgentMode(false);
              setModeMenuAnchor(null);
            }}
            sx={{
              py: 0.5,
              px: 1.5,
              minHeight: 'auto',
            }}
          >
            <QuestionAnswerOutlinedIcon
              sx={{ fontSize: 16, mr: 1, color: 'text.secondary' }}
            />
            <Box>
              <Typography
                variant="body2"
                sx={{ fontSize: 12, fontWeight: 500, lineHeight: 1.4 }}
              >
                Ask
              </Typography>
              <Typography
                variant="caption"
                sx={{ fontSize: 10, color: 'text.secondary', lineHeight: 1.2 }}
              >
                Reads but won&apos;t edit
              </Typography>
            </Box>
          </MenuItem>
          <MenuItem
            selected={isAgentMode}
            onClick={() => {
              setAgentMode(true);
              setModeMenuAnchor(null);
            }}
            sx={{
              py: 0.5,
              px: 1.5,
              minHeight: 'auto',
            }}
          >
            <CodeOutlinedIcon
              sx={{ fontSize: 16, mr: 1, color: 'text.secondary' }}
            />
            <Box>
              <Typography
                variant="body2"
                sx={{ fontSize: 12, fontWeight: 500, lineHeight: 1.4 }}
              >
                Code
              </Typography>
              <Typography
                variant="caption"
                sx={{ fontSize: 10, color: 'text.secondary', lineHeight: 1.2 }}
              >
                Can write and edit code
              </Typography>
            </Box>
          </MenuItem>
        </Menu>

        {/* AI Provider Selector - Custom Dropdown */}
        <Box
          onClick={(e) =>
            !switching && !isLoading && setProviderMenuAnchor(e.currentTarget)
          }
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            position: 'relative',
            borderRadius: 0.5,
            px: 0.5,
            py: 0.125,
            border: '1px solid',
            borderColor: 'divider',
            cursor: switching || isLoading ? 'default' : 'pointer',
            '&:hover': {
              bgcolor: switching || isLoading ? 'transparent' : 'action.hover',
            },
          }}
        >
          <Box
            component="img"
            src={selectedIcon}
            sx={{
              width: 10,
              height: 10,
            }}
          />
          <Typography
            variant="caption"
            sx={{
              fontSize: 11,
              color: 'text.primary',
              userSelect: 'none',
              maxWidth: 180,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {selectedProvider?.name || 'No AI Provider'}
          </Typography>
        </Box>

        <Menu
          anchorEl={providerMenuAnchor}
          open={Boolean(providerMenuAnchor)}
          onClose={() => setProviderMenuAnchor(null)}
          anchorOrigin={{
            vertical: 'top',
            horizontal: 'left',
          }}
          transformOrigin={{
            vertical: 'bottom',
            horizontal: 'left',
          }}
          PaperProps={{
            sx: {
              mt: -0.5,
              minWidth: 220,
              maxHeight: 300,
            },
          }}
          MenuListProps={{
            sx: {
              py: 0.5,
            },
          }}
        >
          {providers.length === 0 ? (
            <MenuItem disabled sx={{ py: 0.5, px: 1.5, minHeight: 'auto' }}>
              <Typography
                variant="caption"
                sx={{ fontSize: 11, color: 'text.secondary' }}
              >
                No AI providers configured
              </Typography>
            </MenuItem>
          ) : (
            providers.map((p: AIProvider) => {
              const providerIcon =
                aiProviderImages[p.type as keyof typeof aiProviderImages] ||
                defaultIcon;
              return (
                <MenuItem
                  key={p.id}
                  selected={p.id === activeProvider?.id}
                  onClick={() => {
                    setActiveProvider(p.id?.toString() ?? '');
                    setProviderMenuAnchor(null);
                  }}
                  sx={{
                    py: 0.5,
                    px: 1.5,
                    minHeight: 'auto',
                  }}
                >
                  <Box
                    component="img"
                    src={providerIcon}
                    sx={{
                      width: 16,
                      height: 16,
                      mr: 1,
                    }}
                  />
                  <Box sx={{ flex: 1 }}>
                    <Typography
                      variant="body2"
                      sx={{ fontSize: 12, fontWeight: 500, lineHeight: 1.4 }}
                    >
                      {p.name}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: 10,
                        color: 'text.secondary',
                        lineHeight: 1.2,
                      }}
                    >
                      {p.type}
                    </Typography>
                  </Box>
                </MenuItem>
              );
            })
          )}
        </Menu>

        <Box sx={{ flex: 1 }} />
        {isStreaming && (
          <span style={{ fontSize: 11, color: theme.palette.text.disabled }}>
            Generating…
          </span>
        )}
        {(() => {
          if (isLoading) {
            return (
              <Tooltip
                title={isAgentMode ? 'Stop code generation' : 'Stop generation'}
                placement="top"
                arrow
                disableInteractive
              >
                <span>
                  <IconButton
                    color="primary"
                    size="small"
                    onClick={handleCancel}
                    disabled={isCanceling}
                    aria-label={
                      isAgentMode ? 'Stop code generation' : 'Stop generation'
                    }
                    sx={{
                      bgcolor: 'primary.main',
                      color: 'primary.contrastText',
                      width: 22,
                      height: 22,
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
            !sessionId ||
            !plainText.trim() ||
            !activeProvider ||
            activeContextManager.isResolvingContext;
          let tooltipTitle = 'Send message (Enter)';
          if (!activeProvider) tooltipTitle = 'Select an AI provider to send';
          else if (!sessionId) tooltipTitle = 'Open or create a chat session';
          else if (!plainText.trim())
            tooltipTitle = 'Type a message to enable send';
          else if (activeContextManager.isResolvingContext)
            tooltipTitle = 'Resolving context files...';
          else if (activeContextManager.hasContext) {
            tooltipTitle = `Send with ${activeContextManager.totalContextFiles} file${activeContextManager.totalContextFiles !== 1 ? 's' : ''} context (Enter)`;
          }

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
                    width: 22,
                    height: 22,
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
