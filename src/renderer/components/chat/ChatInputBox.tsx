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
import { ContextUsageRing } from './ContextUsageRing';
import type { ContextUsageBreakdown } from './ContextUsageRing';

interface ChatInputBoxProps {
  sessionId?: number;
  contextManager?: ReturnType<typeof useContextManager>;
  onUsage?: (usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }) => void;
  isStreaming?: boolean;
  onStartStream?: (content: string, contextItems?: any[]) => Promise<void>;
  onCancelStream?: () => void;
  contextBreakdown?: ContextUsageBreakdown | null;
}

export const ChatInputBox: React.FC<ChatInputBoxProps> = ({
  sessionId,
  contextManager,
  onUsage,
  isStreaming,
  onStartStream,
  onCancelStream,
  contextBreakdown,
}) => {
  const theme = useTheme();
  const [input, setInput] = React.useState('');
  const [isFilePickerOpen, setIsFilePickerOpen] = React.useState(false);
  const [modeMenuAnchor, setModeMenuAnchor] =
    React.useState<null | HTMLElement>(null);
  const [providerMenuAnchor, setProviderMenuAnchor] =
    React.useState<null | HTMLElement>(null);

  const { pendingMessage, setPendingMessage } = useAppContext();

  // Use provided context manager or create a fallback
  const fallbackContextManager = useContextManager();
  const activeContextManager = contextManager || fallbackContextManager;

  const queryClient = useQueryClient();
  const assistantTempIdRef = React.useRef<number | null>(null);
  const userTempIdRef = React.useRef<number | null>(null);
  const lastAgentWrittenFileRef = React.useRef<string | null>(null);

  // Agent mode state
  const { isAgentMode, setAgentMode } = useAgentMode(sessionId);

  // Chat and agent mutations (runAgent and cancelAgent are now handled via props for agent mode)
  const { mutate: streamMessage, isLoading: isStreamingMode } =
    useStreamChatMessage();
  const { mutate: cancelStream, isLoading: isCancellingMode } =
    useCancelChatStream();

  const { data: aiSettings } = useGetAISettings();

  const { data: providers = [] } = useGetAIProviders();
  const { data: activeProvider } = useGetActiveAIProvider();
  const { mutate: setActiveProvider, isLoading: switching } =
    useSetActiveAIProvider();

  // Combined loading state for both chat and agent modes
  const isLoading = isStreamingMode || isStreaming;
  const isCanceling = isCancellingMode;

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
            // Cancelled by user: remove only the temp assistant and refresh
            queryClient.setQueryData(
              msgKey,
              current.filter((m) => m.id !== aId),
            );
            assistantTempIdRef.current = null;
            await queryClient.invalidateQueries(msgKey);
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
    if (!sessionId || !onStartStream) return;

    setInput('');

    const rawAgentContextItems =
      await activeContextManager.getContextItemsWithAdditionalFiles();
    const agentContextItems =
      aiSettings?.chat?.autoIncludeFileContext !== false
        ? rawAgentContextItems
        : [];

    await onStartStream(
      messageContent,
      agentContextItems.length > 0 ? agentContextItems : undefined,
    );

    // Auto-rename session after successful send (optimistic or actually done depends on hook)
    autoRename(messageContent);
    activeContextManager.clearAdditionalFiles();
  };

  const handleSendMessage = async (content?: string) => {
    const messageContent = content || plainText.trim();
    if (sessionId && messageContent && activeProvider) {
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

    if (isAgentMode) {
      if (onCancelStream) onCancelStream();
    } else {
      cancelStream(
        { sessionId },
        {
          onSettled: async () => {
            const msgKey = [
              QUERY_KEYS.GET_CHAT_MESSAGES_WITH_CONTEXT,
              sessionId,
              undefined,
              undefined,
            ] as const;
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
    if (pendingMessage && sessionId && activeProvider && !isLoading) {
      setTimeout(() => {
        handleSendMessage(pendingMessage);
        setPendingMessage(null);
        setInput('');
      }, 500);
    }
  }, [pendingMessage, sessionId, activeProvider, isLoading]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Context file chips (manually added files only) */}
      {activeContextManager.additionalFiles.length > 0 && (
        <ContextTabs contextManager={activeContextManager} />
      )}

      <Box
        sx={{
          px: 1,
          pt: 1,
          pb: 0.25,
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
            sx={{ width: 10, height: 10 }}
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

        {/* Context usage ring — right of provider selector */}
        <ContextUsageRing breakdown={contextBreakdown ?? null} size={16} />

        <Menu
          anchorEl={providerMenuAnchor}
          open={Boolean(providerMenuAnchor)}
          onClose={() => setProviderMenuAnchor(null)}
          anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
          transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          PaperProps={{ sx: { mt: -0.5, minWidth: 200, maxHeight: 300 } }}
          MenuListProps={{ sx: { py: 0.5 } }}
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
                  sx={{ py: 0.5, px: 1.5, minHeight: 'auto' }}
                >
                  <Box
                    component="img"
                    src={providerIcon}
                    sx={{ width: 16, height: 16, mr: 1 }}
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
                sx={{ fontWeight: !isAgentMode ? 600 : 400 }}
              >
                Ask
              </Typography>
              <Typography variant="caption" color="text.disabled">
                Ask questions about your project
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
                sx={{ fontWeight: isAgentMode ? 600 : 400 }}
              >
                Code
              </Typography>
              <Typography variant="caption" color="text.disabled">
                Autonomously explore and edit code
              </Typography>
            </Box>
          </MenuItem>
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
