import React from 'react';
import {
  Box,
  Paper,
  IconButton,
  Tooltip,
  Typography,
  Button,
  CircularProgress,
  Menu,
  MenuItem,
} from '@mui/material';
import { Close, MoreHoriz, Add as AddIcon, Tag } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAppContext } from '../../hooks';
import { useGetSelectedProject } from '../../controllers';
import {
  useCreateChatSession,
  useGetChatSessions,
  useUpdateChatSession,
  useDeleteChatSession,
  useGetChatMessagesWithContext,
} from '../../controllers/chat.controller';
import {
  useGetAIProviders,
  useGetActiveAIProvider,
} from '../../controllers/aiProviders.controller';
import { NewChatButton } from './NewChatButton';
import { SessionHistoryButton } from './SessionHistoryButton';
import { ChatMessageList } from './ChatMessageList';
import { ChatInputBox } from './ChatInputBox';
import { FilesChangedBlock } from './FilesChangedBlock';
import { GradientBorder } from './GradientBorder';
import type { ContextUsageBreakdown } from './ContextUsageRing';

import { useContextManager } from '../../hooks/useContextManager';
import { useAgentStream } from '../../hooks/useAgentStream';
import { useToolMode } from '../../hooks/useToolMode';
import {
  useOnStreamChunk,
  useOnContextUsage,
} from '../../controllers/agent.controller';
import { projectsServices } from '../../services';

export interface ChatWindowProps {
  screenKey?: 'project' | 'sql' | 'notebooks';
  connectionId?: string;
  notebookId?: string;
  projectId?: number | null;
  onClose?: () => void;
}

const SCREEN_BADGE: Record<string, { label: string; color: string }> = {
  sql: { label: 'SQL', color: '#1976d2' },
  notebooks: { label: 'NOTEBOOKS', color: '#7b1fa2' },
  project: { label: 'PROJECT', color: 'primary.main' },
};

export const ChatWindow: React.FC<ChatWindowProps> = ({
  screenKey = 'project',
  connectionId,
  notebookId,
  projectId: propProjectId,
  onClose,
}) => {
  const {
    setIsChatOpen,
    openFile,
    setEditingFilePath,
    closeFile,
    refreshFileTree,
  } = useAppContext();
  const { data: project } = useGetSelectedProject();
  const projectId =
    propProjectId !== undefined
      ? propProjectId
      : (project?.id as number | undefined);
  const navigate = useNavigate();

  const [selectedSessionId, setSelectedSessionId] = React.useState<number>();
  const previousScopeKeyRef = React.useRef<string | null>(null);
  const [lastUsage, setLastUsage] = React.useState<{
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null>(null);
  const [contextBreakdown, setContextBreakdown] =
    React.useState<ContextUsageBreakdown | null>(null);
  const hasAuthoritativeContextBreakdownRef = React.useRef(false);

  // New Agent Stream Hook
  const {
    streamState,
    startStream,
    cancelStream,
    confirmTerminal,
    clearError,
  } = useAgentStream(selectedSessionId);

  // Tool mode — drives which tools are available in the backend
  const { currentMode } = useToolMode(selectedSessionId);

  // Load messages for the selected session (used to estimate context usage on session switch)
  const { data: sessionMessages = [] } =
    useGetChatMessagesWithContext(selectedSessionId);
  const { data: activeProvider } = useGetActiveAIProvider();

  // Reset usage + context breakdown when session changes
  React.useEffect(() => {
    setLastUsage(null);
    setContextBreakdown(null);
    hasAuthoritativeContextBreakdownRef.current = false;
  }, [selectedSessionId]);

  // Estimate context usage from loaded history whenever session or messages change.
  // This keeps the ring meaningful even before the first agent run.
  React.useEffect(() => {
    if (hasAuthoritativeContextBreakdownRef.current) return;
    if (!selectedSessionId || sessionMessages.length === 0) return;

    // Rough token estimate: ~3 chars per token
    const historyChars = sessionMessages.reduce(
      (sum, m) => sum + (m.content?.length ?? 0),
      0,
    );
    const historyTokens = Math.ceil(historyChars / 3);

    // Derive context window from active provider model (fallback 32k)
    const cfg =
      typeof (activeProvider as any)?.config === 'string'
        ? JSON.parse((activeProvider as any).config)
        : (activeProvider as any)?.config;
    const modelId = cfg?.model ?? '';
    const contextWindow = (() => {
      const m = modelId.toLowerCase();
      if (m.includes('gemini-2.5') || m.includes('gemini-3')) return 1_000_000;
      if (m.includes('claude') || m.includes('gpt-4')) return 200_000;
      if (m.includes('gpt-4o') || m.includes('gpt-4.1')) return 128_000;
      return 32_000;
    })();

    const percentUsed = Math.min(
      100,
      Math.round((historyTokens / contextWindow) * 100),
    );

    setContextBreakdown({
      conversation: historyTokens,
      userFiles: 0,
      skills: 0,
      mcpTools: 0,
      total: historyTokens,
      contextWindow,
      percentUsed,
    });
  }, [selectedSessionId, sessionMessages.length, activeProvider]);

  // Listen for usage from agent mode (IPC events) — FE-03: via controller hooks, not raw IPC
  useOnStreamChunk(selectedSessionId, (data) => {
    if (data.done && data.usage) {
      setLastUsage(data.usage);
    }
  });

  useOnContextUsage(selectedSessionId, (data) => {
    if (data.breakdown) {
      hasAuthoritativeContextBreakdownRef.current = true;
      setContextBreakdown(data.breakdown as unknown as ContextUsageBreakdown);
    }
  });

  // Context management
  const contextManager = useContextManager();

  const screenBadge = React.useMemo(() => {
    if (screenKey === 'project') return null;
    const badge = SCREEN_BADGE[screenKey] ?? SCREEN_BADGE.project;
    const hasProject = !!projectId;

    let tooltipText = '';
    if (screenKey === 'sql') {
      tooltipText = hasProject
        ? 'SQL Editor — connection tools + dbt project tools active'
        : 'SQL Editor — connection tools only (no dbt project linked)';
    } else {
      tooltipText = hasProject
        ? 'Notebooks — notebook + connection + dbt project tools active'
        : 'Notebooks — notebook + connection tools (no dbt project linked)';
    }

    return { label: badge.label, color: badge.color, tooltip: tooltipText };
  }, [screenKey, projectId]);

  const disabledReason = React.useMemo(() => {
    if (screenKey !== 'notebooks') return null;
    if (!connectionId) return 'Select a connection to start AI Agent';
    if (!notebookId) return 'Select a notebook to start AI Agent';
    return null;
  }, [screenKey, connectionId, notebookId]);

  const canUseChatScope = React.useMemo(() => {
    if (screenKey === 'notebooks') {
      return !disabledReason;
    }

    return Boolean(projectId || connectionId || notebookId);
  }, [screenKey, disabledReason, projectId, connectionId, notebookId]);

  const { data: sessions = [], isLoading } = useGetChatSessions(
    {
      projectId: projectId ?? undefined,
      screenKey,
      connectionId: connectionId ?? null,
      notebookId: notebookId ?? null,
    },
    {
      enabled: canUseChatScope,
    },
  );

  const sessionScopeKey = React.useMemo(
    () =>
      `${screenKey}|${projectId ?? 'none'}|${connectionId ?? 'none'}|${notebookId ?? 'none'}`,
    [screenKey, projectId, connectionId, notebookId],
  );
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

  const isCreatingRef = React.useRef(false);

  React.useEffect(() => {
    if (!canUseChatScope) {
      previousScopeKeyRef.current = sessionScopeKey;
      setSelectedSessionId(undefined);
      return;
    }

    if (isLoading || isCreatingRef.current) return;

    const previousScopeKey = previousScopeKeyRef.current;
    const hasScopeChanged =
      previousScopeKey !== null && previousScopeKey !== sessionScopeKey;
    previousScopeKeyRef.current = sessionScopeKey;

    if (sessions.length > 0) {
      setSelectedSessionId((prev) => {
        // On connection/screen scope change, always switch to latest session
        // in the new scope.
        if (hasScopeChanged) {
          return sessions[0].id as unknown as number;
        }

        // Keep current selection only if it still exists in current scope.
        if (
          prev &&
          sessions.some((s) => (s.id as unknown as number) === prev)
        ) {
          return prev;
        }

        // Initial load or stale selection fallback.
        return sessions[0].id as unknown as number;
      });
      return;
    }
    if (canUseChatScope) {
      // Auto-create a default chat session for the project or connection
      isCreatingRef.current = true;
      createSession({
        title: 'New Chat',
        projectId: projectId ?? undefined,
        screenKey,
        connectionId,
        notebookId,
      });
    }
  }, [
    sessions,
    isLoading,
    projectId,
    connectionId,
    notebookId,
    screenKey,
    canUseChatScope,
    sessionScopeKey,
    createSession,
  ]);

  // Reset isCreatingRef when isCreating state changes to false
  React.useEffect(() => {
    if (!isCreating) {
      isCreatingRef.current = false;
    }
  }, [isCreating]);

  const handleCreateNewSession = () => {
    if (canUseChatScope) {
      const sessionCount = sessions.length;
      const title = `Chat ${sessionCount + 1}`;
      createSession({
        title,
        projectId: projectId ?? undefined,
        screenKey,
        connectionId,
        notebookId,
      });
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

  const [menuAnchor, setMenuAnchor] = React.useState<null | HTMLElement>(null);

  const handleMenuOpen = (e: React.MouseEvent<HTMLElement>) =>
    setMenuAnchor(e.currentTarget);
  const handleMenuClose = () => setMenuAnchor(null);

  const navigateToAISettings = (tab: string) => {
    handleMenuClose();
    navigate(`/app/settings/ai-providers?tab=${encodeURIComponent(tab)}`);
  };

  const [dismissedRunKey, setDismissedRunKey] = React.useState<string | null>(
    null,
  );

  // Build a stable key for the current run: sessionId + step count fingerprint
  // Resets to null whenever a new stream starts (steps reset to [])
  const currentRunKey = React.useMemo(() => {
    if (!selectedSessionId || streamState.steps.length === 0) return null;
    // Use the first step's toolCallId as a stable run identifier
    const firstToolCallId =
      streamState.steps[0]?.toolCalls[0]?.id ?? String(Date.now());
    return `${selectedSessionId}:${firstToolCallId}`;
  }, [selectedSessionId, streamState.steps]);

  // Drag and drop state for entire ChatWindow
  const [isDragOver, setIsDragOver] = React.useState(false);

  // Handle file drops on entire ChatWindow
  const handleDragOver = React.useCallback((e: React.DragEvent) => {
    // Check if this has file path data (from Monaco tabs or tree files)
    const hasFilePath =
      e.dataTransfer.types.includes('application/x-file-path') ||
      e.dataTransfer.types.includes('text/plain');

    // Handle any drag with file paths (Monaco tabs or tree files)
    if (hasFilePath && screenKey === 'project') {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = React.useCallback((e: React.DragEvent) => {
    // Only reset if we're leaving the ChatWindow entirely
    if (e.currentTarget === e.target) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = React.useCallback(
    (e: React.DragEvent) => {
      const hasFilePath =
        e.dataTransfer.types.includes('application/x-file-path') ||
        e.dataTransfer.types.includes('text/plain');

      // Handle any drop with file paths (Monaco tabs or tree files)
      if (hasFilePath && screenKey === 'project') {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        const filePath =
          e.dataTransfer.getData('application/x-file-path') ||
          e.dataTransfer.getData('text/plain');

        if (!filePath) return;

        const name = filePath.split('/').pop() ?? filePath;
        const alreadyAdded = contextManager.additionalFiles.some(
          (f) => f.path === filePath,
        );

        if (!alreadyAdded) {
          contextManager.addFiles([
            { path: filePath, name, relativePath: name, fileType: 'other' },
          ]);
        }
      }
    },
    [contextManager],
  );

  // Reset dismissed state when a new stream starts
  React.useEffect(() => {
    if (streamState.isStreaming) {
      setDismissedRunKey(null);
    }
  }, [streamState.isStreaming]);

  // Derive changed files from completed stream
  const changedFiles = React.useMemo(() => {
    if (
      streamState.isStreaming ||
      !selectedSessionId ||
      !currentRunKey ||
      dismissedRunKey === currentRunKey
    ) {
      return [];
    }

    // Use a Map to keep only the latest update per file
    const fileMap = new Map<
      string,
      { path: string; added: number; removed: number }
    >();

    streamState.steps.forEach((step) => {
      step.toolCalls.forEach((tc) => {
        if (
          (tc.toolName === 'writeDbtModel' || tc.toolName === 'writeFile') &&
          tc.status === 'done'
        ) {
          const path = (tc.args as any)?.filePath || (tc.args as any)?.path;
          if (path) {
            const result = tc.result as any;
            fileMap.set(path, {
              path,
              added: result?.linesAdded ?? 0,
              removed: result?.linesRemoved ?? 0,
            });
          }
        }
      });
    });

    return Array.from(fileMap.values());
  }, [
    streamState.steps,
    streamState.isStreaming,
    selectedSessionId,
    currentRunKey,
    dismissedRunKey,
  ]);

  const handleOpenFile = (path: string) => {
    setEditingFilePath?.(path);
    openFile?.(path);
  };

  const renderMessages = () => {
    if (disabledReason) {
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
            AI Agent Disabled
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {disabledReason}
          </Typography>
        </Box>
      );
    }

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

    return (
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        <ChatMessageList
          sessionId={selectedSessionId}
          lastUsage={lastUsage}
          streamState={streamState}
          isAgentRunning={streamState.isStreaming}
          screenKey={screenKey}
          onConfirmTerminal={confirmTerminal}
          onClearError={clearError}
          onOpenFile={handleOpenFile}
        />

        {changedFiles.length > 0 && (
          <Box sx={{ px: 2, pb: 2 }}>
            <FilesChangedBlock
              files={changedFiles}
              onOpenFile={handleOpenFile}
              onDismiss={() => {
                if (currentRunKey) setDismissedRunKey(currentRunKey);
              }}
              onDiscard={async () => {
                // Close tabs for discarded files
                changedFiles.forEach((f) => closeFile?.(f.path));
                // Delete files from disk
                await Promise.allSettled(
                  changedFiles.map((f) =>
                    projectsServices.deleteItem({ filePath: f.path }),
                  ),
                );
                // Refresh file tree to remove deleted files
                await refreshFileTree?.();
                if (currentRunKey) setDismissedRunKey(currentRunKey);
                toast.success('Agent-created files discarded.');
              }}
            />
          </Box>
        )}
      </Box>
    );
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
        borderColor: isDragOver ? 'primary.main' : 'divider',
        borderWidth: isDragOver ? '2px' : '1px',
        overflow: 'hidden',
        position: 'relative',
        transition: 'border-color 0.2s, border-width 0.2s',
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay indicator */}
      {isDragOver && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            zIndex: 1000,
            bgcolor: 'rgba(25, 118, 210, 0.08)',
            border: '2px dashed',
            borderColor: 'primary.main',
            borderRadius: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <Box
            sx={{
              bgcolor: 'background.paper',
              px: 3,
              py: 1.5,
              borderRadius: 1,
              boxShadow: 3,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <AddIcon sx={{ color: 'primary.main', fontSize: 20 }} />
            <Typography variant="body2" color="primary.main" fontWeight={500}>
              Drop to add to context
            </Typography>
          </Box>
        </Box>
      )}

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
          minWidth: 0,
          overflow: 'hidden',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Left side: active session title */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
          }}
        >
          {selectedSessionId &&
            sessions.length > 0 &&
            (() => {
              const activeSession = sessions.find(
                (s) => (s.id as unknown as number) === selectedSessionId,
              );
              return activeSession ? (
                <>
                  <Tag
                    sx={{
                      fontSize: '0.75rem',
                      color: 'text.secondary',
                      ml: 0.5,
                    }}
                  />
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: '0.75rem',
                      fontWeight: 400,
                      color: 'text.secondary',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      minWidth: 0,
                      lineHeight: 1,
                    }}
                  >
                    {activeSession.title}
                  </Typography>
                </>
              ) : null;
            })()}
        </Box>

        {/* Screen Context Badge */}
        {screenBadge && (
          <Tooltip title={screenBadge.tooltip} arrow>
            <Box
              id={`ai-chat-screen-badge-${screenKey}`}
              sx={{
                flexShrink: 0,
                fontSize: '0.5rem',
                fontWeight: 700,
                lineHeight: 1,
                px: 0.75,
                py: 0.25,
                borderRadius: '4px',
                bgcolor: screenBadge.color,
                color: '#fff',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                cursor: 'help',
              }}
            >
              {screenBadge.label}
            </Box>
          </Tooltip>
        )}

        {/* Right side controls - Session Management + Close */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.25,
            flexShrink: 0,
          }}
        >
          <NewChatButton
            onCreate={handleCreateNewSession}
            disabled={!canUseChatScope || isLoading}
            loading={isCreating}
          />

          <SessionHistoryButton
            sessions={sessions}
            selectedId={selectedSessionId}
            onSelect={handleSessionSelect}
            onDelete={handleSessionDelete}
            onRename={handleSessionRename}
            disabled={!canUseChatScope || isLoading}
          />

          <Tooltip title="More options">
            <IconButton
              size="small"
              onClick={handleMenuOpen}
              sx={{ width: 24, height: 24, padding: 0.25 }}
            >
              <MoreHoriz sx={{ fontSize: '0.875rem' }} />
            </IconButton>
          </Tooltip>

          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={handleMenuClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{
              paper: {
                sx: { minWidth: 120, py: 0.25 },
              },
            }}
          >
            {(
              [
                { label: 'Providers', tab: 'Providers' },
                { label: 'Settings', tab: 'Settings' },
                { label: 'MCP Servers', tab: 'MCP Servers' },
                { label: 'Skills', tab: 'Skills' },
              ] as const
            ).map(({ label, tab }) => (
              <MenuItem
                key={tab}
                onClick={() => navigateToAISettings(tab)}
                dense
                sx={{
                  py: 0.5,
                  px: 1.5,
                  minHeight: 'unset',
                  fontSize: '0.8rem',
                }}
              >
                {label}
              </MenuItem>
            ))}
          </Menu>

          <Tooltip title="Close">
            <IconButton
              size="small"
              onClick={() => {
                if (onClose) onClose();
                else setIsChatOpen?.(false);
              }}
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
        <GradientBorder loading={streamState.isStreaming}>
          <ChatInputBox
            sessionId={selectedSessionId}
            contextManager={contextManager}
            isStreaming={streamState.isStreaming}
            screenKey={screenKey}
            disabledReason={disabledReason}
            onStartStream={(content, contextItems, toolMode) =>
              // toolMode is now forwarded from ChatInputBox (owns the toggle state)
              startStream(
                content,
                contextItems,
                undefined,
                toolMode ?? currentMode,
                screenKey,
                connectionId,
                notebookId,
              )
            }
            onCancelStream={cancelStream}
            contextBreakdown={contextBreakdown}
          />
        </GradientBorder>
      </Box>
    </Paper>
  );
};
