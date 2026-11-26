import type { ExtensionMainApi } from '../../../extensionApi/main';
import { AnalyticsPagesService } from './analyticsPages.service';
import {
  NewAnalyticsPage,
  UpdateAnalyticsPage,
} from '../../../extensionApi/studioMain/analyticsPagesTypes';

export const registerAnalyticsPagesHandlers = (api: ExtensionMainApi) => {
  api.ipc.handle('analyticsPages:list', async (_event, connectionId: string) =>
    AnalyticsPagesService.list(connectionId),
  );

  api.ipc.handle(
    'analyticsPages:get',
    async (
      _event,
      { connectionId, pageId }: { connectionId: string; pageId: string },
    ) => AnalyticsPagesService.get(connectionId, pageId),
  );

  api.ipc.handle(
    'analyticsPages:create',
    async (
      _event,
      { connectionId, data }: { connectionId: string; data: NewAnalyticsPage },
    ) => AnalyticsPagesService.create(connectionId, data),
  );

  api.ipc.handle(
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

  api.ipc.handle(
    'analyticsPages:delete',
    async (
      _event,
      { connectionId, pageId }: { connectionId: string; pageId: string },
    ) => AnalyticsPagesService.delete(connectionId, pageId),
  );
};
