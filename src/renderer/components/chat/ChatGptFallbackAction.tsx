import React from 'react';
import { Button } from '@mui/material';
import { toast } from 'react-toastify';
import {
  useGetAIProviders,
  useSetActiveAIProvider,
} from '../../controllers/aiProviders.controller';

/**
 * Plan 71, D7: when the ChatGPT plan limit is reached or the sign-in has
 * ended, offer to switch to another configured provider. It never retries
 * the run: the user sends the message again after switching.
 */
export const ChatGptFallbackAction: React.FC<{ onSwitched?: () => void }> = ({
  onSwitched,
}) => {
  const { data: providers = [] } = useGetAIProviders();
  const fallback =
    providers.find((p) => p.type === 'openai') ??
    providers.find((p) => p.type !== 'openai-codex');

  const { mutate: setActive, isLoading } = useSetActiveAIProvider({
    onSuccess: () => {
      toast.success(
        `Switched to ${fallback?.name}. Send your message again to continue.`,
      );
      onSwitched?.();
    },
    onError: (error) => {
      toast.error(`Failed to switch provider: ${error.message}`);
    },
  });

  if (!fallback?.id) return null;

  return (
    <Button
      color="inherit"
      size="small"
      disabled={isLoading}
      onClick={() => setActive(String(fallback.id))}
    >
      Switch to {fallback.name}
    </Button>
  );
};
