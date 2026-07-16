import React from 'react';
import {
  Typography,
  useColorScheme,
  useTheme,
  Box,
  Chip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@mui/material';
import {
  AutoAwesome as AiAssistIcon,
  ContentCopy as CopyIcon,
  ContentPasteSearch as CopyAllIcon,
  DeleteSweep as ClearIcon,
} from '@mui/icons-material';
import AnsiToHtml from 'ansi-to-html';
import { useAppContext, useProcess } from '../../hooks';
import { OutputBox, TerminalContainer } from './styles';
import { buildTerminalAiPrompt } from './aiAssist';

const ProcessTerminal: React.FC = () => {
  const { mode } = useColorScheme();
  const theme = useTheme();
  const {
    output,
    error,
    stop,
    clearOutput,
    isRunning,
    pid,
    command,
    duration,
    status,
  } = useProcess();
  const { openChatWithMessage } = useAppContext();
  const outputRef = React.useRef<HTMLDivElement>(null);

  const [contextMenu, setContextMenu] = React.useState<{
    mouseX: number;
    mouseY: number;
    selectedText: string;
  } | null>(null);

  const lastSelectionRef = React.useRef<string>('');

  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) {
      const text = selection.toString();
      if (text) {
        lastSelectionRef.current = text;
      }
    }
  };

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    const selection = window.getSelection();
    let selectedText = selection ? selection.toString() : '';

    // If current selection is empty, try the last known selection
    if (!selectedText && lastSelectionRef.current) {
      selectedText = lastSelectionRef.current;
    }

    setContextMenu(
      contextMenu === null
        ? {
            mouseX: event.clientX + 2,
            mouseY: event.clientY - 4,
            selectedText,
          }
        : null,
    );
  };

  const handleClose = () => {
    setContextMenu(null);
  };

  const handleCopy = () => {
    const textToCopy =
      contextMenu?.selectedText ||
      window.getSelection()?.toString() ||
      lastSelectionRef.current;

    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
    }
    handleClose();
  };

  const handleCopyAll = () => {
    const allText = [...output, ...error].join('\n');
    if (allText) {
      navigator.clipboard.writeText(allText);
    }
    handleClose();
  };

  const aiPrompt = buildTerminalAiPrompt(
    contextMenu?.selectedText ?? '',
    output,
    error,
  );

  const handleAskAi = () => {
    if (aiPrompt) {
      openChatWithMessage(aiPrompt);
    }
    handleClose();
  };

  const handleClear = () => {
    clearOutput();
    handleClose();
  };

  // Theme-based terminal colors
  const getTerminalColors = (themeMode: string | undefined) => {
    switch (themeMode) {
      case 'dark':
        return {
          fg: theme.palette.common.white,
          bg: theme.palette.grey[900],
        };
      case 'light':
        return {
          fg: theme.palette.common.black,
          bg: theme.palette.grey[50],
        };
      case 'system':
        return {
          fg: theme.palette.text.primary,
          bg: theme.palette.background.paper,
        };
      default:
        return {
          fg: theme.palette.text.primary,
          bg: theme.palette.background.default,
        };
    }
  };

  const terminalColors = getTerminalColors(mode);

  const ansiConverter = React.useMemo(
    () =>
      new AnsiToHtml({
        fg: terminalColors.fg,
        bg: terminalColors.bg,
        newline: true,
        escapeXML: true,
        stream: false,
      }),
    [terminalColors.fg, terminalColors.bg],
  );

  // Auto scroll to bottom
  React.useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output, error]);

  // Keyboard shortcuts
  React.useEffect(() => {
    const container = outputRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = window.electron.app.os === 'darwin';
      const isStopCombo =
        (isMac && e.metaKey && e.key === 'c') ||
        (!isMac && e.ctrlKey && e.key === 'c');
      const isClearCombo = !isMac && e.ctrlKey && e.key === 'l';

      if (isStopCombo && isRunning) {
        e.preventDefault();
        stop();
      } else if (isClearCombo) {
        e.preventDefault();
        clearOutput();
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line consistent-return
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [isRunning, stop, clearOutput]);

  const formatDuration = (ms: number | null) => {
    if (!ms) return '0s';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  // eslint-disable-next-line @typescript-eslint/no-shadow
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'success';
      case 'starting':
        return 'info';
      case 'stopping':
        return 'warning';
      case 'stopped':
        return 'default';
      default:
        return 'default';
    }
  };

  return (
    <TerminalContainer
      onContextMenu={handleContextMenu}
      onMouseUp={handleMouseUp}
    >
      {/* Status Bar */}
      <Box
        sx={{
          p: 1,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          backgroundColor: terminalColors.bg,
        }}
      >
        <Chip
          label={status.toUpperCase()}
          color={getStatusColor(status)}
          size="small"
        />
        {pid && <Chip label={`PID: ${pid}`} variant="outlined" size="small" />}
        {duration && (
          <Chip
            label={formatDuration(duration)}
            variant="outlined"
            size="small"
          />
        )}
        {command && (
          <Typography variant="caption" sx={{ ml: 'auto', opacity: 0.7 }}>
            {command.length > 50 ? `${command.substring(0, 50)}...` : command}
          </Typography>
        )}
      </Box>

      <OutputBox
        ref={outputRef}
        tabIndex={0}
        style={{
          backgroundColor: terminalColors.bg,
          color: terminalColors.fg,
        }}
      >
        {output.map((line: any, index: number) => (
          <Typography
            key={`out-${index}`}
            variant="body2"
            sx={{
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              color: terminalColors.fg,
            }}
            dangerouslySetInnerHTML={{ __html: ansiConverter.toHtml(line) }}
          />
        ))}
        {error.map((line: any, index: number) => (
          <Typography
            key={`err-${index}`}
            variant="body2"
            color="error"
            sx={{
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
            }}
            dangerouslySetInnerHTML={{ __html: ansiConverter.toHtml(line) }}
          />
        ))}
      </OutputBox>

      <Menu
        open={contextMenu !== null}
        onClose={handleClose}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
        slotProps={{
          paper: {
            sx: {
              minWidth: 120,
              backgroundColor: terminalColors.bg,
              border: `1px solid ${theme.palette.divider}`,
              '& .MuiList-root': {
                padding: '4px 0',
              },
            },
          },
        }}
      >
        <MenuItem
          onClick={handleCopy}
          dense
          sx={{ py: 0.5, px: 1.5 }}
          disabled={!contextMenu?.selectedText}
        >
          <ListItemIcon sx={{ minWidth: '28px !important' }}>
            <CopyIcon sx={{ fontSize: 16 }} />
          </ListItemIcon>
          <ListItemText
            primaryTypographyProps={{ variant: 'body2', fontSize: 12 }}
          >
            Copy
          </ListItemText>
        </MenuItem>
        <MenuItem onClick={handleCopyAll} dense sx={{ py: 0.5, px: 1.5 }}>
          <ListItemIcon sx={{ minWidth: '28px !important' }}>
            <CopyAllIcon sx={{ fontSize: 16 }} />
          </ListItemIcon>
          <ListItemText
            primaryTypographyProps={{ variant: 'body2', fontSize: 12 }}
          >
            Copy All
          </ListItemText>
        </MenuItem>
        <Divider sx={{ my: '4px !important' }} />
        <MenuItem
          onClick={handleAskAi}
          dense
          sx={{ py: 0.5, px: 1.5 }}
          disabled={!aiPrompt}
        >
          <ListItemIcon sx={{ minWidth: '28px !important' }}>
            <AiAssistIcon sx={{ fontSize: 16 }} />
          </ListItemIcon>
          <ListItemText
            primaryTypographyProps={{ variant: 'body2', fontSize: 12 }}
          >
            Ask AI Agent
          </ListItemText>
        </MenuItem>
        <Divider sx={{ my: '4px !important' }} />
        <MenuItem onClick={handleClear} dense sx={{ py: 0.5, px: 1.5 }}>
          <ListItemIcon sx={{ minWidth: '28px !important' }}>
            <ClearIcon sx={{ fontSize: 16 }} />
          </ListItemIcon>
          <ListItemText
            primaryTypographyProps={{ variant: 'body2', fontSize: 12 }}
          >
            Clear
          </ListItemText>
        </MenuItem>
      </Menu>
    </TerminalContainer>
  );
};

export { ProcessTerminal };
