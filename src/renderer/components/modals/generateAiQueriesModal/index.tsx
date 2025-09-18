import React from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  useTheme,
} from '@mui/material';
import { ContentCopy, Close } from '@mui/icons-material';
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
      .map((query) => `-- ${query.description}\n${query.query}`)
      .join('\n\n\n');
  }, [data]);

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      fullWidth
      maxWidth="lg"
      slotProps={{
        paper: {
          style: {
            backgroundColor: isDarkMode
              ? theme.palette.background.default
              : undefined,
            width: '90vw',
            maxWidth: '1200px',
            height: '80vh',
            maxHeight: '800px',
          },
        },
      }}
    >
      <DialogTitle>Generated Analytics</DialogTitle>
      <DialogContent
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
        }}
      >
        <Container
          style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
        >
          <AceEditor
            style={{
              cursor: 'pointer',
            }}
            mode="sql"
            width="100%"
            fontSize={18}
            height="100%"
            value={value}
            readOnly
            theme={isDarkMode ? 'dracula' : 'tomorrow'}
          />
        </Container>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            toast.info('Copied to clipboard!');
          }}
          variant="outlined"
          startIcon={<ContentCopy />}
          className="mb-2"
        >
          Copy
        </Button>
        <Button
          onClick={onClose}
          variant="outlined"
          startIcon={<Close />}
          className="mb-2"
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};
