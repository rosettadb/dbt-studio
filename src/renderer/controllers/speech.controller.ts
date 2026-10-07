/**
 * Speech Controller
 * React Query hooks for offline dictation status and setup.
 */

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { toast } from 'react-toastify';
import { speechService } from '../services/speech.service';
import type { SpeechSetupEvent, SpeechStatus } from '../../types/speech';

export const speechKeys = {
  all: ['speech'] as const,
  status: () => [...speechKeys.all, 'status'] as const,
};

export function useSpeechStatus() {
  return useQuery<SpeechStatus>({
    queryKey: speechKeys.status(),
    queryFn: () => speechService.status(),
    staleTime: 30_000,
  });
}

/** Subscribe to setup progress (FE-03 via service). */
export function useSpeechSetupEvents(
  handler: (event: SpeechSetupEvent) => void,
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => speechService.onSetupEvent((e) => handlerRef.current(e)), []);
}

/**
 * Setup mutation bundled with the latest progress event, so any component can
 * show "Downloading… 42%" while another one triggered the setup.
 */
export function useSpeechSetup() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<SpeechSetupEvent | null>(null);

  useSpeechSetupEvents((event) => {
    setProgress(event.phase === 'done' ? null : event);
    if (event.phase === 'done' || event.phase === 'error') {
      queryClient.invalidateQueries(speechKeys.status());
    }
  });

  const mutation = useMutation({
    mutationFn: () => speechService.setup(),
    onMutate: () => {
      queryClient.setQueryData<SpeechStatus | undefined>(
        speechKeys.status(),
        (current) => (current ? { ...current, status: 'installing' } : current),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries(speechKeys.status());
      toast.success('Dictation is ready');
    },
    onError: (error: Error) => {
      setProgress(null);
      queryClient.invalidateQueries(speechKeys.status());
      toast.error(error.message);
    },
  });

  return { ...mutation, progress };
}

export function useRemoveSpeechModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => speechService.removeModel(),
    onSuccess: () => {
      queryClient.invalidateQueries(speechKeys.status());
      toast.success('Speech model removed');
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries(speechKeys.status());
      toast.error(error.message);
    },
  });
}
