import React from 'react';
import { Button, Stack, Typography } from '@mui/material';
import type { QueryClient } from 'react-query';
import { toast } from 'react-toastify';
import {
  resetSecondBrainQueriesAfterDelete,
  SECOND_BRAIN_KEYS,
} from '../../controllers/secondBrain.controller';
import { loadAISettings, saveAISettings } from '../../services/agent.service';
import * as secondBrainService from '../../services/secondBrain.service';
import type { AISettingsConfig } from '../../../types/backend';
import { ReactComponent as MemoriesIcon } from '../../assets/icons/lucide/brain-circuit.svg';

export const AGENT_MEMORY_SETTINGS_PATH = `/app/settings/ai-providers?tab=${encodeURIComponent('Agent Memory')}`;

const SETUP_FAILED_TOAST_ID = 'agent-memory-setup-failed';

// The build takes minutes and the user may change AI settings meanwhile, so
// re-read the settings before each write instead of reusing an old copy.
const updateSecondBrainSettings = async (
  queryClient: QueryClient,
  patch: Partial<AISettingsConfig['secondBrain']>,
): Promise<void> => {
  const latest = await loadAISettings();
  await saveAISettings({
    ...latest,
    secondBrain: { ...latest.secondBrain, ...patch },
  });
  await queryClient.invalidateQueries(['ai-settings']);
};

const SetupFailedToast: React.FC<{
  reason: string;
  onOpenSettings: () => void;
}> = ({ reason, onOpenSettings }) => (
  <Stack spacing={0.75} alignItems="flex-start">
    <Typography variant="body2">
      Agent Memory could not be set up: {reason}
    </Typography>
    <Button
      size="small"
      variant="outlined"
      color="inherit"
      startIcon={<MemoriesIcon width={14} height={14} />}
      onClick={onOpenSettings}
    >
      Open Agent Memory
    </Button>
  </Stack>
);

/**
 * Builds Agent Memory without blocking the AI panel. The first build can take
 * minutes; progress and Stop live in Settings → Agent Memory. If the build
 * does not finish, memory goes back to off so settings never show it on
 * while it is empty.
 */
export const buildAgentMemoryInBackground = async ({
  queryClient,
  openAgentMemorySettings,
}: {
  queryClient: QueryClient;
  openAgentMemorySettings: () => void;
}): Promise<void> => {
  toast.dismiss(SETUP_FAILED_TOAST_ID);
  toast.info(
    'Building Agent Memory in the background. Follow progress in Settings → Agent Memory.',
  );
  let filesMayBeRemoved = false;
  try {
    const { result } = await secondBrainService.initialize();
    if (result.status === 'cancelled') {
      filesMayBeRemoved = true;
      await updateSecondBrainSettings(queryClient, { enabled: false });
      toast.info(
        'Agent Memory setup was stopped, so memory stays off. You can start it again in Settings → Agent Memory.',
      );
      return;
    }
    await updateSecondBrainSettings(queryClient, { initialized: true });
    toast.success('Agent Memory is ready.');
  } catch (error) {
    filesMayBeRemoved = true;
    await updateSecondBrainSettings(queryClient, { enabled: false }).catch(
      () => undefined,
    );
    toast.error(
      <SetupFailedToast
        reason={(error as Error).message}
        onOpenSettings={() => {
          toast.dismiss(SETUP_FAILED_TOAST_ID);
          openAgentMemorySettings();
        }}
      />,
      { toastId: SETUP_FAILED_TOAST_ID, autoClose: false, closeOnClick: false },
    );
  } finally {
    // A first build that fails or is stopped removes the files it created.
    await (
      filesMayBeRemoved
        ? resetSecondBrainQueriesAfterDelete(queryClient)
        : queryClient.invalidateQueries(SECOND_BRAIN_KEYS.all)
    ).catch(() => undefined);
  }
};
