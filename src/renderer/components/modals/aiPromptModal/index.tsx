import React from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  useTheme,
} from '@mui/material';
import { Close, AutoAwesome, ContentCopy } from '@mui/icons-material';
import AceEditor from 'react-ace';

import 'ace-builds/src-noconflict/theme-tomorrow';
import 'ace-builds/src-noconflict/theme-dracula';

import { toast } from 'react-toastify';
import { Container } from '../../sqlEditor/queryHistory/styles';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  response?: string;
  onApply: (value: string) => void;
};

export const AiPromptModal: React.FC<Props> = ({
  isOpen,
  onClose,
  prompt,
  onPromptChange,
  onSubmit,
  response,
  onApply,
}) => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  const [isDisabled, setIsDisabled] = React.useState(false);

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
      <DialogTitle>Prompt</DialogTitle>
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
            value={response ?? prompt}
            readOnly={!!response}
            onChange={onPromptChange}
            theme={isDarkMode ? 'dracula' : 'tomorrow'}
          />
        </Container>
      </DialogContent>
      <DialogActions>
        {response ? (
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              onClick={() => {
                onApply(response);
              }}
              variant="outlined"
              startIcon={<ContentCopy />}
              className="mb-2"
            >
              Apply
            </Button>
            <Button
              onClick={async () => {
                if (response) {
                  await navigator.clipboard.writeText(response);
                  toast.info('Copied to clipboard!');
                }
              }}
              variant="outlined"
              startIcon={<ContentCopy />}
              className="mb-2"
            >
              Copy
            </Button>
          </Box>
        ) : (
          <Button
            onClick={() => {
              setIsDisabled(true);
              onSubmit();
            }}
            disabled={isDisabled}
            variant="outlined"
            startIcon={<AutoAwesome />}
            className="mb-2"
          >
            Generate
          </Button>
        )}

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
