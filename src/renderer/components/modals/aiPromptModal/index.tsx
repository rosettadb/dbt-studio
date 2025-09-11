import React from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  useTheme,
  CircularProgress,
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
  isLoading?: boolean;
};

export const AiPromptModal: React.FC<Props> = ({
  isOpen,
  onClose,
  prompt,
  onPromptChange,
  onSubmit,
  response,
  onApply,
  isLoading = false,
}) => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  const [isDisabled, setIsDisabled] = React.useState(false);

  React.useEffect(() => {
    if (!isLoading) {
      setIsDisabled(false);
    }
  }, [isLoading, isOpen]);

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
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            position: 'relative',
          }}
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
            readOnly={!!response || isLoading}
            onChange={onPromptChange}
            theme={isDarkMode ? 'dracula' : 'tomorrow'}
          />
          {isLoading && !response && (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'rgba(0,0,0,0.25)',
                zIndex: 1,
              }}
            >
              <CircularProgress />
            </Box>
          )}
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
            disabled={isDisabled || isLoading}
            variant="outlined"
            startIcon={
              isLoading ? <CircularProgress size={16} /> : <AutoAwesome />
            }
            className="mb-2"
          >
            {isLoading ? 'Generating...' : 'Generate'}
          </Button>
        )}

        <Button
          onClick={onClose}
          variant="outlined"
          startIcon={<Close />}
          className="mb-2"
          disabled={isLoading}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};
