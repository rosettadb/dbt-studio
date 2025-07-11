import React from 'react';
import { Typography, useColorScheme, useTheme } from '@mui/material';
import { toast } from 'react-toastify';
import AnsiToHtml from 'ansi-to-html';
import { useCli } from '../../hooks';
import { OutputBox, StyledInput, TerminalContainer, InputLine } from './styles';
import { useGetSettings } from '../../controllers';
import { Project } from '../../../types/backend';

type Props = {
  project: Project;
};

const Terminal: React.FC<Props> = ({ project }) => {
  const { mode } = useColorScheme();
  const theme = useTheme();
  const { output, runCommand, error } = useCli();
  const [command, setCommand] = React.useState('');
  const outputRef = React.useRef(null);
  const { data: settings } = useGetSettings();

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

  React.useEffect(() => {
    if (outputRef.current) {
      (outputRef.current as HTMLElement).scrollTop = (
        outputRef?.current as HTMLElement
      ).scrollHeight;
    }
  }, [output, error]);

  const handleSendCommand = () => {
    if (command.trim()) {
      let newCommand = command.trim();
      if (
        !newCommand.startsWith('rosetta') &&
        !newCommand.startsWith('dbt') &&
        !newCommand.startsWith('git') &&
        !newCommand.startsWith('python')
      ) {
        toast.error('Only rosetta and dbt commands are allowed!');
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
      runCommand(newCommand).catch(() => {});
      setCommand('');
    }
  };

  return (
    <TerminalContainer
      onSubmit={(event) => {
        event.preventDefault();
        handleSendCommand();
      }}
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
              whiteSpace: 'pre-wrap',
            }}
            dangerouslySetInnerHTML={{ __html: ansiConverter.toHtml(line) }}
          />
        ))}
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
          sx={{
            '& .MuiInputBase-input': {
              color: terminalColors.fg,
              fontFamily: 'monospace',
            },
            '& .MuiInputBase-input::placeholder': {
              color: theme.palette.text.secondary,
              opacity: 1,
            },
          }}
        />
      </InputLine>
    </TerminalContainer>
  );
};

export { Terminal };
