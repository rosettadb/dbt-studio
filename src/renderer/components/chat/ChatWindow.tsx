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
import { Close, MoreHoriz } from '@mui/icons-material';
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
import {
  useOnStreamChunk,
  useOnContextUsage,
} from '../../controllers/agent.controller';
import { projectsServices } from '../../services';

export const ChatWindow: React.FC = () => {
  const {
    setIsChatOpen,
    openFile,
    setEditingFilePath,
    closeFile,
    refreshFileTree,
  } = useAppContext();
  const { data: project } = useGetSelectedProject();
  const projectId = project?.id as number | undefined;
  const navigate = useNavigate();

  const [selectedSessionId, setSelectedSessionId] = React.useState<number>();
  const [lastUsage, setLastUsage] = React.useState<{
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null>(null);
  const [contextBreakdown, setContextBreakdown] =
    React.useState<ContextUsageBreakdown | null>(null);

  // New Agent Stream Hook
  const {
    streamState,
    startStream,
    cancelStream,
    confirmTerminal,
    clearError,
  } = useAgentStream(selectedSessionId);

  // Load messages for the selected session (used to estimate context usage on session switch)
  const { data: sessionMessages = [] } =
    useGetChatMessagesWithContext(selectedSessionId);
  const { data: activeProvider } = useGetActiveAIProvider();

  // Reset usage + context breakdown when session changes
  React.useEffect(() => {
    setLastUsage(null);
    setContextBreakdown(null);
  }, [selectedSessionId]);

  // Estimate context usage from loaded history whenever session or messages change.
  // This keeps the ring meaningful even before the first agent run.
  React.useEffect(() => {
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
      setContextBreakdown(data.breakdown as unknown as ContextUsageBreakdown);
    }
  });

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
          minWidth: 0,
          overflow: 'hidden',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Left side: beta badge + active session title */}
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
          <Box
            sx={{
              flexShrink: 0,
              fontSize: '0.55rem',
              fontWeight: 600,
              lineHeight: 1,
              px: 0.75,
              py: 0.25,
              borderRadius: '4px',
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              letterSpacing: '0.03em',
              textTransform: 'uppercase',
            }}
          >
            beta
          </Box>

          {selectedSessionId &&
            sessions.length > 0 &&
            (() => {
              const activeSession = sessions.find(
                (s) => (s.id as unknown as number) === selectedSessionId,
              );
              return activeSession ? (
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: '0.875rem',
                    fontWeight: 500,
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
              ) : null;
            })()}
        </Box>

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
        <GradientBorder loading={streamState.isStreaming}>
          <ChatInputBox
            sessionId={selectedSessionId}
            contextManager={contextManager}
            onUsage={(usage) => setLastUsage(usage)}
            isStreaming={streamState.isStreaming}
            onStartStream={startStream}
            onCancelStream={cancelStream}
            contextBreakdown={contextBreakdown}
          />
        </GradientBorder>
      </Box>
    </Paper>
  );
};
