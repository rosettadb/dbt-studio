import React from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  useTheme,
} from '@mui/material';
import AceEditor from 'react-ace';
import { toast } from 'react-toastify';

// Import the required Ace editor themes
import 'ace-builds/src-noconflict/theme-tomorrow';
import 'ace-builds/src-noconflict/theme-dracula';

import { Container } from '../../sqlEditor/queryHistory/styles';
import { GenerateDashboardResponseType } from '../../../../types/backend';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  data: GenerateDashboardResponseType[];
};

export const GenerateAiQueriesModal: React.FC<Props> = ({
  isOpen,
  onClose,
  data,
}) => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  const value = React.useMemo(() => {
    return data
      .map((query) => `# ${query.description}\n${query.query}`)
      .join('\n\n\n');
  }, [data]);

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      fullWidth
      slotProps={{
        paper: {
          style: {
            backgroundColor: isDarkMode
              ? theme.palette.background.default
              : undefined,
          },
        },
      }}
    >
      <DialogTitle>Generated Dashboards</DialogTitle>
      <DialogContent>
        <Container>
          <AceEditor
            style={{
              cursor: 'pointer',
            }}
            mode="sql"
            width="auto"
            fontSize={18}
            height="400px"
            value={value}
            readOnly
            theme={isDarkMode ? 'dracula' : 'tomorrow'}
          />
          <div
            style={{
              display: 'flex',
              width: '100%',
              marginTop: 8,
            }}
          >
            <Button
              onClick={async () => {
                await navigator.clipboard.writeText(value);
                toast.info('Copied to clipboard!');
              }}
              variant="outlined"
              style={{
                marginLeft: 'auto',
              }}
            >
              Copy
            </Button>
          </div>
        </Container>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};
