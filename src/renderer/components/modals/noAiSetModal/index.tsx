import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  styled,
} from '@mui/material';
import { SmartToy, Settings } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

const StyledDialogContent = styled(DialogContent)`
  padding: 24px;
`;

const HeaderSection = styled(Box)`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
`;

interface NoAiSetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NoAiSetModal: React.FC<NoAiSetModalProps> = ({
  isOpen,
  onClose,
}) => {
  const navigate = useNavigate();

  const handleGoToSettings = () => {
    onClose();
    navigate('/app/settings/ai-providers');
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="no-ai-set-dialog-title"
    >
      <DialogTitle id="no-ai-set-dialog-title">
        <HeaderSection>
          <SmartToy color="primary" />
          <Typography variant="h6" component="span">
            AI Provider Required
          </Typography>
        </HeaderSection>
      </DialogTitle>

      <StyledDialogContent>
        <Typography variant="body1" paragraph>
          To use AI-powered features like generating dbt business layers, you
          need to configure an AI provider first.
        </Typography>

        <Typography variant="body1" paragraph>
          Currently supported:
        </Typography>

        <Box sx={{ ml: 2, mb: 2 }}>
          <Typography variant="body2" component="li">
            OpenAI (GPT-4) - Requires API key
          </Typography>
        </Box>

        <Typography variant="body2" color="text.secondary">
          Click &#34;Configure AI Provider&#34; to set up your API keys in the
          settings.
        </Typography>
      </StyledDialogContent>

      <DialogActions sx={{ padding: '16px 24px' }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleGoToSettings}
          variant="contained"
          color="primary"
          startIcon={<Settings />}
        >
          Configure AI Provider
        </Button>
      </DialogActions>
    </Dialog>
  );
};
