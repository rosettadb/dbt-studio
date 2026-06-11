import React from 'react';
import {
  Typography,
  useColorScheme,
  useTheme,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@mui/material';
import {
  ContentCopy as CopyIcon,
  ContentPasteSearch as CopyAllIcon,
  DeleteSweep as ClearIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import AnsiToHtml from 'ansi-to-html';
import { useCli, useCommandHistory } from '../../hooks';
import { OutputBox, StyledInput, TerminalContainer, InputLine } from './styles';
import { useGetSettings } from '../../controllers';
import { Project } from '../../../types/backend';

type Props = {
  project: Project;
};

export const Terminal: React.FC<Props> = ({ project }) => {
  const { mode } = useColorScheme();
  const theme = useTheme();
  const { output, error, runCommandAsync, isRunning, clearOutput } = useCli();
  const [command, setCommand] = React.useState('');
  const outputRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const { data: settings } = useGetSettings();
  const { record, getPrev, getNext, resetPointer } = useCommandHistory();

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

  const handleClear = () => {
    clearOutput();
    handleClose();
  };

  // Theme-based terminal colors using Material UI theme
  const getTerminalColors = (themeMode: string | undefined) => {
    switch (themeMode) {
      case 'dark':
        return {
          fg: theme.palette.common.white,
          bg: theme.palette.grey[900],
          promptColor: theme.palette.success.main,
        };
      case 'light':
        return {
          fg: theme.palette.common.black,
          bg: theme.palette.grey[50],
          promptColor: theme.palette.success.dark,
        };
      case 'system':
        return {
          fg: theme.palette.text.primary,
          bg: theme.palette.background.paper,
          promptColor: theme.palette.success.main,
        };
      default:
        return {
          fg: theme.palette.text.primary,
          bg: theme.palette.background.default,
          promptColor: theme.palette.success.main,
        };
    }
  };

  const terminalColors = getTerminalColors(mode);

  // Create ansiConverter based on current theme
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

  // Auto scroll to bottom when output changes
  React.useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output, error]);

  const moveCaretToEnd = React.useCallback((value: string) => {
    if (typeof window === 'undefined') {
      return;
    }

    window.setTimeout(() => {
      if (!inputRef.current) {
        return;
      }
      const { length } = value;
      inputRef.current.focus();
      inputRef.current.setSelectionRange(length, length);
    }, 0);
  }, []);

  const handleSendCommand = () => {
    const originalCommand = command.trim();
    if (originalCommand) {
      let newCommand = originalCommand;

      const allowedCommands = ['rosetta', 'dbt', 'git', 'python'];
      const isAllowed = allowedCommands.some((cmd) =>
        newCommand.startsWith(cmd),
      );

      if (!isAllowed) {
        toast.error('Only rosetta, dbt, git, and python commands are allowed!');
        return;
      }

      const [baseCommand, ...rest] = originalCommand.split(/\s+/);
      if (baseCommand === 'python' && rest.length === 0) {
        toast.error(
          'Interactive Python sessions are not supported. Please provide a script or arguments.',
        );
        return;
      }

      if (newCommand.startsWith('git')) {
        const navigateCommand = `cd "${project.path}"`;
        newCommand = `${navigateCommand} && ${newCommand}`;
      }

      if (newCommand.startsWith('rosetta')) {
        const tmpCommand = newCommand.replace(
          'rosetta',
          `"${settings?.rosettaPath}"`,
        );
        const navigateCommand = `cd "${project.path}/rosetta"`;
        newCommand = `${navigateCommand} && ${tmpCommand}`;
      }

      if (newCommand.startsWith('python')) {
        newCommand = newCommand.replace('python', `"${settings?.pythonPath}"`);
      }

      if (newCommand.startsWith('dbt')) {
        const tmpCommand = newCommand.replace('dbt', `"${settings?.dbtPath}"`);
        const navigateCommand = `cd "${project.path}"`;
        newCommand = `${navigateCommand} && ${tmpCommand}`;
      }

      record(originalCommand);
      runCommandAsync(newCommand);
      setCommand('');
      resetPointer();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendCommand();
      return;
    }

    if (isRunning) {
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const previousCommand = getPrev(command);
      setCommand(previousCommand);
      moveCaretToEnd(previousCommand);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const nextCommand = getNext(command);
      setCommand(nextCommand);
      moveCaretToEnd(nextCommand);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setCommand('');
      resetPointer();
      moveCaretToEnd('');
    }
  };

  return (
    <TerminalContainer
      onContextMenu={handleContextMenu}
      onMouseUp={handleMouseUp}
    >
      <OutputBox
        ref={outputRef}
        style={{
          backgroundColor: terminalColors.bg,
          color: terminalColors.fg,
        }}
      >
        {output.map((line, index) => (
          <Typography
            key={`out-${index}`}
            variant="body2"
            sx={{
              fontFamily: 'monospace',
              fontSize: 12,
              lineHeight: 1.25,
              whiteSpace: 'pre-wrap',
              color: terminalColors.fg,
            }}
            dangerouslySetInnerHTML={{ __html: ansiConverter.toHtml(line) }}
          />
        ))}
        {error.map((line, index) => (
          <Typography
            key={`err-${index}`}
            variant="body2"
            color="error"
            sx={{
              fontFamily: 'monospace',
              fontSize: 12,
              lineHeight: 1.25,
              whiteSpace: 'pre-wrap',
            }}
            dangerouslySetInnerHTML={{ __html: ansiConverter.toHtml(line) }}
          />
        ))}
        {isRunning && (
          <Typography
            variant="body2"
            sx={{
              fontFamily: 'monospace',
              fontSize: 12,
              lineHeight: 1.25,
              color: theme.palette.info.main,
              opacity: 0.7,
            }}
          >
            Command running...
          </Typography>
        )}
      </OutputBox>

      <InputLine
        style={{
          backgroundColor: terminalColors.bg,
          borderTop: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Typography
          variant="body2"
          sx={{
            fontFamily: 'monospace',
            fontSize: 12,
            lineHeight: 1.25,
            color: terminalColors.promptColor,
          }}
        >
          @{project.name} $
        </Typography>
        <StyledInput
          fullWidth
          placeholder="Type a rosetta or dbt command..."
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isRunning}
          inputRef={inputRef}
          sx={{
            '& .MuiInputBase-input': {
              color: terminalColors.fg,
              fontFamily: 'monospace',
              fontSize: 12,
              lineHeight: 1.25,
            },
            '& .MuiInputBase-input::placeholder': {
              color: theme.palette.text.secondary,
              opacity: 1,
            },
          }}
        />
      </InputLine>

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
