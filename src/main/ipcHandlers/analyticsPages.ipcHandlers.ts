import { ipcMain } from 'electron';
import { AnalyticsPagesService } from '../services/analyticsPages.service';
import {
  NewAnalyticsPage,
  UpdateAnalyticsPage,
} from '../../types/analyticsPages';
import type { SaveLocation } from '../../shared/projectFolders';

export const registerAnalyticsPagesHandlers = () => {
  ipcMain.handle('analyticsPages:list', async (_event, connectionId: string) =>
    AnalyticsPagesService.list(connectionId),
  );

  ipcMain.handle(
    'analyticsPages:get',
    async (
      _event,
      { connectionId, pageId }: { connectionId: string; pageId: string },
    ) => AnalyticsPagesService.get(connectionId, pageId),
  );

  ipcMain.handle(
    'analyticsPages:create',
    async (
      _event,
      {
        connectionId,
        data,
        location,
      }: {
        connectionId: string;
        data: NewAnalyticsPage;
        location?: SaveLocation;
      },
    ) => AnalyticsPagesService.create(connectionId, data, location),
  );

  ipcMain.handle(
    'analyticsPages:update',
    async (
      _event,
      {
        connectionId,
        pageId,
        updates,
      }: {
        connectionId: string;
        pageId: string;
        updates: UpdateAnalyticsPage;
      },
    ) => AnalyticsPagesService.update(connectionId, pageId, updates),
  );

  ipcMain.handle(
    'analyticsPages:delete',
    async (
      _event,
      { connectionId, pageId }: { connectionId: string; pageId: string },
    ) => AnalyticsPagesService.delete(connectionId, pageId),
  );
};
