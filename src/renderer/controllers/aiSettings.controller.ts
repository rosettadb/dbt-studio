import { useQuery, useMutation, useQueryClient } from 'react-query';
import * as aiSettingsService from '../services/agent.service';
import type { AISettingsConfig } from '../../types/backend';

export const useGetAISettings = () =>
  useQuery(['ai-settings'], aiSettingsService.loadAISettings, {
    staleTime: Infinity,
  });

export const useSaveAISettings = () => {
  const qc = useQueryClient();
  return useMutation(
    (config: AISettingsConfig) => aiSettingsService.saveAISettings(config),
    {
      onSuccess: () => qc.invalidateQueries(['ai-settings']),
    },
  );
};

export const useGetAISettingsFilePath = () =>
  useQuery(
    ['ai-settings', 'file-path'],
    aiSettingsService.getAISettingsFilePath,
  );
