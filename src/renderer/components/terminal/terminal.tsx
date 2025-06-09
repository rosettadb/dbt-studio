import React from 'react';
import { Typography } from '@mui/material';
import { toast } from 'react-toastify';
import AnsiToHtml from 'ansi-to-html';
import { useCli } from '../../hooks';
import { OutputBox, StyledInput, TerminalContainer, InputLine } from './styles';
import { useGetSettings } from '../../controllers';
import { Project } from '../../../types/backend';

type Props = {
  project: Project;
};

const ansiConverter = new AnsiToHtml({
  fg: '#fff',
  bg: '#1e1e1e',
  newline: true,
  escapeXML: true,
  stream: false,
});

const Terminal: React.FC<Props> = ({ project }) => {
  const { output, runCommand, error } = useCli();
  const [command, setCommand] = React.useState('');
  const outputRef = React.useRef(null);
  const { data: settings } = useGetSettings();

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
      runCommand(newCommand).catch();
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
      <OutputBox ref={outputRef}>
        {output.map((line, index) => (
          <Typography
            key={`out-${index}`}
            variant="body2"
            color="text.primary"
            sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}
            dangerouslySetInnerHTML={{ __html: ansiConverter.toHtml(line) }}
          />
        ))}
        {error.map((line, index) => (
          <Typography
            key={`err-${index}`}
            variant="body2"
            color="error"
            sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}
            dangerouslySetInnerHTML={{ __html: ansiConverter.toHtml(line) }}
          />
        ))}
      </OutputBox>

      <InputLine>
        <Typography
          variant="body2"
          sx={{ fontFamily: 'monospace', color: 'limegreen' }}
        >
          @{project.name} $
        </Typography>
        <StyledInput
          fullWidth
          placeholder="Type a rosetta or dbt command..."
          value={command}
          onChange={(e) => setCommand(e.target.value)}
        />
      </InputLine>
    </TerminalContainer>
  );
};

export { Terminal };
