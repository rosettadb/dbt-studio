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

import { FilePickerModal } from './FilePickerModal';

import { useGetAISettings } from '../../controllers/aiSettings.controller';

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
import { useToolMode } from '../../hooks/useToolMode';
import { ContextUsageRing } from './ContextUsageRing';
import type { ContextUsageBreakdown } from './ContextUsageRing';
import { getUserMessageLimitError } from '../../../types/agentEvents';

interface ChatInputBoxProps {
  sessionId?: number;
  contextManager?: ReturnType<typeof useContextManager>;
  isStreaming?: boolean;
  onStartStream?: (
    content: string,
    contextItems?: any[],
    toolMode?: 'chat' | 'agent',
  ) => Promise<void>;
  onCancelStream?: () => void;
  contextBreakdown?: ContextUsageBreakdown | null;
  screenKey?: string;
  disabledReason?: string | null;
}

export const ChatInputBox: React.FC<ChatInputBoxProps> = ({
  sessionId,
  contextManager,
  isStreaming,
  onStartStream,
  onCancelStream,
  contextBreakdown,
  screenKey,
  disabledReason,
}) => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
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

  // Tool mode state (replaces useAgentMode)
  const { isCodeMode, currentMode, setToolMode } = useToolMode(sessionId);

  const { data: aiSettings } = useGetAISettings();

  const { data: providers = [] } = useGetAIProviders();
  const { data: activeProvider } = useGetActiveAIProvider();
  const { mutate: setActiveProvider, isLoading: switching } =
    useSetActiveAIProvider();

  // All messages now route through the agent path
  const isLoading = isStreaming;
  const isCanceling = false;
  const isBlocked = !!disabledReason;
  const inputDisabled = isLoading || isBlocked;

  // Auto-rename session hook
  const { autoRename } = useAutoRenameSession(sessionId);

  // Use the utility function instead of inline implementation
  const plainText = React.useMemo(() => htmlToPlainText(input), [input]);
  const messageLimitError = React.useMemo(
    () =>
      getUserMessageLimitError(
        plainText.trim(),
        contextBreakdown?.contextWindow ?? 32_000,
      ),
    [plainText, contextBreakdown?.contextWindow],
  );

  const selectedProvider = React.useMemo(() => {
    const id = activeProvider?.id?.toString();
    return providers.find((p) => p.id?.toString() === id) || null;
  }, [providers, activeProvider]);

  const getProviderModel = React.useCallback((provider?: AIProvider | null) => {
    if (!provider?.config) return '';
    try {
      const config =
        typeof provider.config === 'string'
          ? JSON.parse(provider.config)
          : provider.config;
      return config?.model || config?.modelId || '';
    } catch {
      return '';
    }
  }, []);

  const selectedModelLabel =
    getProviderModel(selectedProvider) ||
    selectedProvider?.name ||
    'No AI Provider';

  const selectedIcon = React.useMemo(() => {
    if (!selectedProvider) return defaultIcon;
    const typeKey = selectedProvider.type as keyof typeof aiProviderImages;
    return aiProviderImages[typeKey] || defaultIcon;
  }, [selectedProvider]);

  // All messages now route through the agent path
  const handleSendAgentMessage = async (messageContent: string) => {
    if (!sessionId || !onStartStream) return;

    setInput('');

    const agentContextItems =
      await activeContextManager.getContextItemsWithAdditionalFiles();
    const activeFileContext = activeContextManager.selectedFileContext;
    if (
      aiSettings?.chat?.autoIncludeFileContext !== false &&
      activeFileContext &&
      !agentContextItems.some(
        (item) => item.metadata?.path === activeFileContext.metadata?.path,
      )
    ) {
      agentContextItems.unshift(activeFileContext);
    }

    await onStartStream(
      messageContent,
      agentContextItems.length > 0 ? agentContextItems : undefined,
      currentMode,
    );

    // Auto-rename session after successful send (optimistic or actually done depends on hook)
    autoRename(messageContent);
    activeContextManager.clearAdditionalFiles();
  };

  const handleSendMessage = async (content?: string) => {
    if (disabledReason) return;

    const messageContent = content || plainText.trim();
    const limitError = getUserMessageLimitError(
      messageContent,
      contextBreakdown?.contextWindow ?? 32_000,
    );
    if (limitError) return;
    if (sessionId && messageContent && activeProvider) {
      await handleSendAgentMessage(messageContent);
    }
  };

  const handleSend = async () => {
    await handleSendMessage();
  };

  const handleCancel = () => {
    if (!sessionId) return;
    if (onCancelStream) onCancelStream();
  };

  React.useEffect(() => {
    if (
      pendingMessage &&
      sessionId &&
      activeProvider &&
      !isLoading &&
      !disabledReason
    ) {
      setTimeout(() => {
        handleSendMessage(pendingMessage);
        setPendingMessage(null);
        setInput('');
      }, 500);
    }
  }, [pendingMessage, sessionId, activeProvider, isLoading, disabledReason]);

  return (
    <Box
      sx={{ display: 'flex', flexDirection: 'column', position: 'relative' }}
    >
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
            placeholder={disabledReason ?? 'Type a message...'}
            disabled={inputDisabled}
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
        {screenKey !== 'sql' && (
          <>
            <Tooltip
              title={disabledReason ?? 'Add context...'}
              placement="top"
              arrow
              enterDelay={500}
            >
              <IconButton
                size="small"
                onClick={() => {
                  if (!isBlocked) {
                    setIsFilePickerOpen(true);
                  }
                }}
                disabled={isBlocked}
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
              excludeFiles={activeContextManager.additionalFiles.map(
                (f) => f.path,
              )}
            />
          </>
        )}

        {/* Agent/Chat Mode Selector - Custom Dropdown */}
        <Box
          onClick={(e) => {
            if (!inputDisabled) {
              setModeMenuAnchor(e.currentTarget);
            }
          }}
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
            opacity: isBlocked ? 0.6 : 1,
            cursor: inputDisabled ? 'default' : 'pointer',
            '&:hover': {
              bgcolor: inputDisabled ? 'transparent' : 'action.hover',
            },
          }}
        >
          {isCodeMode ? (
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
            {isCodeMode ? 'Code' : 'Ask'}
          </Typography>
        </Box>

        {/* AI Provider Selector - Custom Dropdown */}
        <Box
          onClick={(e) =>
            !switching &&
            !inputDisabled &&
            setProviderMenuAnchor(e.currentTarget)
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
            opacity: isBlocked ? 0.6 : 1,
            cursor: switching || inputDisabled ? 'default' : 'pointer',
            '&:hover': {
              bgcolor:
                switching || inputDisabled ? 'transparent' : 'action.hover',
            },
          }}
        >
          <Box
            component="img"
            src={selectedIcon}
            sx={{
              width: 10,
              height: 10,
              filter:
                isDarkMode &&
                selectedProvider?.type !== 'gemini' &&
                selectedProvider?.type !== 'lmstudio'
                  ? 'brightness(0) invert(1) opacity(0.85)'
                  : undefined,
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
            {selectedModelLabel}
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
              const modelLabel = getProviderModel(p) || p.type;
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
                    sx={{
                      width: 16,
                      height: 16,
                      mr: 1,
                      filter:
                        isDarkMode &&
                        p.type !== 'gemini' &&
                        p.type !== 'lmstudio'
                          ? 'brightness(0) invert(1) opacity(0.85)'
                          : undefined,
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
                      {modelLabel}
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
            selected={currentMode === 'chat'}
            onClick={() => {
              setToolMode('chat');
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
                sx={{ fontWeight: currentMode === 'chat' ? 600 : 400 }}
              >
                Ask
              </Typography>
              <Typography variant="caption" color="text.disabled">
                Ask questions about your project
              </Typography>
            </Box>
          </MenuItem>
          <MenuItem
            selected={currentMode === 'agent'}
            onClick={() => {
              setToolMode('agent');
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
                sx={{ fontWeight: currentMode === 'agent' ? 600 : 400 }}
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
                title={isCodeMode ? 'Stop code generation' : 'Stop generation'}
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
                      isCodeMode ? 'Stop code generation' : 'Stop generation'
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
            isBlocked ||
            !sessionId ||
            !plainText.trim() ||
            !!messageLimitError ||
            !activeProvider ||
            activeContextManager.isResolvingContext;
          let tooltipTitle = 'Send message (Enter)';
          if (disabledReason) tooltipTitle = disabledReason;
          else if (!activeProvider)
            tooltipTitle = 'Select an AI provider to send';
          else if (!sessionId) tooltipTitle = 'Open or create a chat session';
          else if (!plainText.trim())
            tooltipTitle = 'Type a message to enable send';
          else if (messageLimitError) tooltipTitle = messageLimitError;
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
