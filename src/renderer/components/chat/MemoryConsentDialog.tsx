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
import { toast } from 'react-toastify';
import {
  useGetAISettings,
  useInitializeSecondBrain,
  useSaveAISettings,
} from '../../controllers';
import { ReactComponent as MemoriesIcon } from '../../assets/icons/lucide/brain-circuit.svg';

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

export const MemoryConsentDialog: React.FC = () => {
  const [open, setOpen] = React.useState(
    () => getMemoryConsentDecision() === null,
  );
  const [selectedChoice, setSelectedChoice] = React.useState<boolean | null>(
    null,
  );
  const settingsQuery = useGetAISettings();
  const saveSettings = useSaveAISettings();
  const initializeSecondBrain = useInitializeSecondBrain();
  const busy =
    selectedChoice !== null ||
    settingsQuery.isLoading ||
    saveSettings.isLoading ||
    initializeSecondBrain.isLoading;

  const handleChoice = async (enabled: boolean) => {
    const settings = settingsQuery.data;
    if (!settings) return;

    setSelectedChoice(enabled);
    try {
      let nextSettings = {
        ...settings,
        secondBrain: { ...settings.secondBrain, enabled },
      };
      await saveSettings.mutateAsync(nextSettings);

      if (enabled && !settings.secondBrain.initialized) {
        await initializeSecondBrain.mutateAsync();
        nextSettings = {
          ...nextSettings,
          secondBrain: { ...nextSettings.secondBrain, initialized: true },
        };
        await saveSettings.mutateAsync(nextSettings);
      }

      storeMemoryConsentDecision(enabled);
      setOpen(false);
      toast.success(
        enabled
          ? 'AI Agent Memory is enabled and ready.'
          : 'Memory will remain disabled.',
      );
    } catch (error) {
      toast.error(
        enabled
          ? `Memory could not be enabled: ${(error as Error).message}`
          : `Memory preference could not be saved: ${(error as Error).message}`,
      );
    } finally {
      setSelectedChoice(null);
    }
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
