import React from 'react';
import {
  Box,
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  useTheme,
} from '@mui/material';
import {
  AutoAwesome as AiAssistIcon,
  ContentCopy as CopyIcon,
  ContentPaste as PasteIcon,
  DeleteOutline as KillIcon,
  DeleteSweep as ClearIcon,
  SelectAll as SelectAllIcon,
} from '@mui/icons-material';
import '@xterm/xterm/css/xterm.css';
import { useAppContext } from '../../../hooks';
import { buildTerminalAiPrompt } from '../aiAssist';
import { shellSessions } from './shellSessions';
import { shellBackground } from './shellTheme';

type Props = {
  sessionId: string;
};

type ContextMenuState = {
  mouseX: number;
  mouseY: number;
  selectedText: string;
};

const menuItemSx = { py: 0.5, px: 1.5 };
const menuIconSx = { minWidth: '28px !important' };
const menuTextProps = { variant: 'body2' as const, fontSize: 12 };

/**
 * Shows one shell session. The terminal itself is owned by `shellSessions`;
 * this component only gives it a place on screen, keeps its grid matched to
 * that place and adds the right-click menu.
 */
export const ShellTerminalView: React.FC<Props> = ({ sessionId }) => {
  const theme = useTheme();
  const { openChatWithMessage } = useAppContext();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [contextMenu, setContextMenu] = React.useState<ContextMenuState | null>(
    null,
  );

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const detach = shellSessions.attach(sessionId, container);
    shellSessions.focus(sessionId);

    // The panel is resized by the splitter, the window, the chat pane and
    // the session list appearing; all of them end up here.
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => shellSessions.fit(sessionId));
    });
    observer.observe(container);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      detach();
    };
  }, [sessionId]);

  const closeMenu = React.useCallback(() => {
    setContextMenu(null);
    // Give the keyboard back to the shell once the menu is gone.
    window.setTimeout(() => shellSessions.focus(sessionId), 0);
  }, [sessionId]);

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenu(
      contextMenu === null
        ? {
            mouseX: event.clientX + 2,
            mouseY: event.clientY - 4,
            selectedText: shellSessions.getSelection(sessionId),
          }
        : null,
    );
  };

  const aiPrompt = contextMenu
    ? buildTerminalAiPrompt(
        contextMenu.selectedText,
        [shellSessions.getRecentText(sessionId)],
        [],
      )
    : null;

  const handleCopy = () => {
    if (contextMenu?.selectedText) {
      navigator.clipboard.writeText(contextMenu.selectedText);
    }
    closeMenu();
  };

  const handlePaste = () => {
    shellSessions.paste(sessionId).catch(() => undefined);
    closeMenu();
  };

  const handleSelectAll = () => {
    shellSessions.selectAll(sessionId);
    closeMenu();
  };

  const handleAskAi = () => {
    if (aiPrompt) openChatWithMessage(aiPrompt);
    closeMenu();
  };

  const handleClear = () => {
    shellSessions.clear(sessionId);
    closeMenu();
  };

  const handleKill = () => {
    setContextMenu(null);
    shellSessions.kill(sessionId).catch(() => undefined);
  };

  const background = shellBackground(theme);

  return (
    <Box
      onContextMenu={handleContextMenu}
      sx={{
        position: 'relative',
        flex: 1,
        minWidth: 0,
        height: '100%',
        backgroundColor: background,
        overflow: 'hidden',
      }}
    >
      <Box
        ref={containerRef}
        data-testid="shell-terminal"
        sx={{
          position: 'absolute',
          top: 4,
          right: 0,
          bottom: 0,
          left: 8,
        }}
      />

      <Menu
        open={contextMenu !== null}
        onClose={closeMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
        slotProps={{
          paper: {
            sx: {
              minWidth: 160,
              backgroundColor: background,
              border: `1px solid ${theme.palette.divider}`,
              '& .MuiList-root': { padding: '4px 0' },
            },
          },
        }}
      >
        <MenuItem
          onClick={handleCopy}
          dense
          sx={menuItemSx}
          disabled={!contextMenu?.selectedText}
        >
          <ListItemIcon sx={menuIconSx}>
            <CopyIcon sx={{ fontSize: 16 }} />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={menuTextProps}>
            Copy
          </ListItemText>
        </MenuItem>
        <MenuItem onClick={handlePaste} dense sx={menuItemSx}>
          <ListItemIcon sx={menuIconSx}>
            <PasteIcon sx={{ fontSize: 16 }} />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={menuTextProps}>
            Paste
          </ListItemText>
        </MenuItem>
        <MenuItem onClick={handleSelectAll} dense sx={menuItemSx}>
          <ListItemIcon sx={menuIconSx}>
            <SelectAllIcon sx={{ fontSize: 16 }} />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={menuTextProps}>
            Select All
          </ListItemText>
        </MenuItem>
        <Divider sx={{ my: '4px !important' }} />
        <MenuItem
          onClick={handleAskAi}
          dense
          sx={menuItemSx}
          disabled={!aiPrompt}
        >
          <ListItemIcon sx={menuIconSx}>
            <AiAssistIcon sx={{ fontSize: 16 }} />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={menuTextProps}>
            Ask AI Agent
          </ListItemText>
        </MenuItem>
        <Divider sx={{ my: '4px !important' }} />
        <MenuItem onClick={handleClear} dense sx={menuItemSx}>
          <ListItemIcon sx={menuIconSx}>
            <ClearIcon sx={{ fontSize: 16 }} />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={menuTextProps}>
            Clear
          </ListItemText>
        </MenuItem>
        <MenuItem onClick={handleKill} dense sx={menuItemSx}>
          <ListItemIcon sx={menuIconSx}>
            <KillIcon sx={{ fontSize: 16 }} />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={menuTextProps}>
            Kill Terminal
          </ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
};
