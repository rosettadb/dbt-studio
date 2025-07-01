import { useCallback } from 'react';
import { UpdateInfo, UpdateSettingsInfo } from '../../types/backend';
import * as updateService from '../services/update.service';

export function useCheckForUpdates(): () => Promise<UpdateInfo | null> {
  return useCallback(() => updateService.checkForUpdates(), []);
}

export function useCheckForSettingsUpdates(): () => Promise<UpdateSettingsInfo | null> {
  return useCallback(() => updateService.checkForSettingsUpdates(), []);
}

export function useDownloadUpdate(): () => Promise<any> {
  return useCallback(() => updateService.downloadUpdate(), []);
}

export function useRestartUpdate(): () => Promise<any> {
  return useCallback(() => updateService.restartUpdate(), []);
}

export function useRejectUpdateVersion(): (version: string) => Promise<any> {
  return useCallback(
    (version: string) => updateService.rejectUpdateVersion(version),
    [],
  );
}
