import React from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import { useQueryClient } from 'react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useGetAISettings, useSaveAISettings } from '../../controllers';
import { ReactComponent as MemoriesIcon } from '../../assets/icons/lucide/brain-circuit.svg';
import {
  type AIProviderSetupState,
  shouldShowMemoryConsent,
} from './aiPanelSetup';
import {
  AGENT_MEMORY_SETTINGS_PATH,
  buildAgentMemoryInBackground,
} from './agentMemoryBuild';

const MEMORY_CONSENT_KEY = 'dbt-studio-second-brain-consent';

export const getMemoryConsentDecision = (): boolean | null => {
  try {
    const stored = window.localStorage.getItem(MEMORY_CONSENT_KEY);
    if (stored === null) return null;
    return stored === 'true';
  } catch {
    return null;
  }
};

const storeMemoryConsentDecision = (enabled: boolean): void => {
  try {
    window.localStorage.setItem(MEMORY_CONSENT_KEY, String(enabled));
  } catch {
    // The backend setting remains authoritative when storage is unavailable.
  }
};

type MemoryConsentDialogProps = {
  providerSetupState: AIProviderSetupState;
};

export const MemoryConsentDialog: React.FC<MemoryConsentDialogProps> = ({
  providerSetupState,
}) => {
  const [storedDecision, setStoredDecision] = React.useState(() =>
    getMemoryConsentDecision(),
  );
  const open = shouldShowMemoryConsent({ providerSetupState, storedDecision });
  const [selectedChoice, setSelectedChoice] = React.useState<boolean | null>(
    null,
  );
  const settingsQuery = useGetAISettings();
  const saveSettings = useSaveAISettings();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const busy =
    selectedChoice !== null ||
    settingsQuery.isLoading ||
    saveSettings.isLoading;

  const handleChoice = async (enabled: boolean) => {
    const settings = settingsQuery.data;
    if (!settings) return;

    setSelectedChoice(enabled);
    try {
      await saveSettings.mutateAsync({
        ...settings,
        secondBrain: { ...settings.secondBrain, enabled },
      });
    } catch (error) {
      toast.error(
        enabled
          ? `Memory could not be enabled: ${(error as Error).message}`
          : `Memory preference could not be saved: ${(error as Error).message}`,
      );
      setSelectedChoice(null);
      return;
    }

    storeMemoryConsentDecision(enabled);
    setStoredDecision(enabled);
    setSelectedChoice(null);

    if (!enabled) {
      toast.success('Memory will remain disabled.');
      return;
    }
    if (settings.secondBrain.initialized) {
      toast.success('AI Agent Memory is enabled.');
      return;
    }
    // The first build can take minutes, so close the dialog and keep the
    // panel usable while it runs.
    buildAgentMemoryInBackground({
      queryClient,
      openAgentMemorySettings: () => navigate(AGENT_MEMORY_SETTINGS_PATH),
    });
  };

  return (
    <Dialog
      open={open}
      disablePortal
      disableEscapeKeyDown
      aria-labelledby="memory-consent-title"
      aria-describedby="memory-consent-description"
      sx={{
        position: 'absolute',
        inset: 0,
        '& .MuiBackdrop-root': {
          position: 'absolute',
        },
        '& .MuiDialog-container': {
          position: 'absolute',
          inset: 0,
        },
      }}
      PaperProps={{
        sx: {
          width: 'calc(100% - 32px)',
          maxWidth: 480,
          m: 2,
          borderRadius: 2,
          border: 1,
          borderColor: 'divider',
          overflow: 'hidden',
        },
      }}
    >
      <DialogTitle id="memory-consent-title" sx={{ px: 3, pt: 3, pb: 1.5 }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <Box
            sx={{
              width: 40,
              height: 40,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 1.5,
              color: 'primary.main',
              bgcolor: 'action.hover',
              '& svg': { width: 23, height: 23 },
            }}
          >
            <MemoriesIcon />
          </Box>
          <Box sx={{ minWidth: 0, pt: 0.25 }}>
            <Typography variant="h6" component="div" sx={{ lineHeight: 1.3 }}>
              AI Agent Memory
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 0.5, lineHeight: 1.5 }}
            >
              Keep useful knowledge available across sessions.
            </Typography>
          </Box>
        </Stack>
      </DialogTitle>

      <DialogContent sx={{ px: 3, pt: '8px !important', pb: 1 }}>
        <Typography
          id="memory-consent-description"
          variant="body2"
          color="text.secondary"
          sx={{ mb: 2.5, lineHeight: 1.55 }}
        >
          Wiki Memory stores durable knowledge as local Markdown files. The AI
          progressively discovers relevant pages instead of loading everything
          into every conversation.
        </Typography>

        <Stack spacing={1.25}>
          {[
            'Remember preferences, workflows, and project knowledge.',
            'Let the AI maintain useful connections as you work.',
            'Review, edit, or disable memory at any time in AI Settings.',
          ].map((item) => (
            <Stack
              key={item}
              direction="row"
              spacing={1.25}
              alignItems="center"
            >
              <Box
                aria-hidden="true"
                sx={{
                  width: 6,
                  height: 6,
                  flex: '0 0 auto',
                  borderRadius: '50%',
                  bgcolor: 'primary.main',
                }}
              />
              <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
                {item}
              </Typography>
            </Stack>
          ))}
        </Stack>

        {settingsQuery.isError && (
          <Alert
            severity="warning"
            sx={{ mt: 2 }}
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => settingsQuery.refetch()}
                disabled={settingsQuery.isFetching}
              >
                Retry
              </Button>
            }
          >
            AI Settings could not be loaded. Retry before choosing a memory
            preference.
          </Alert>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pt: 2, pb: 3, gap: 1, flexWrap: 'wrap' }}>
        <Button
          variant="text"
          color="inherit"
          onClick={() => handleChoice(false)}
          disabled={busy || !settingsQuery.data}
        >
          Keep memory off
        </Button>
        <Button
          variant="contained"
          onClick={() => handleChoice(true)}
          disabled={busy || !settingsQuery.data}
          startIcon={
            selectedChoice === true ? (
              <CircularProgress size={16} color="inherit" />
            ) : undefined
          }
        >
          Enable AI Memory
        </Button>
      </DialogActions>
    </Dialog>
  );
};
