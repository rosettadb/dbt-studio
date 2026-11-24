import {
  AnalyticsPage,
  NewAnalyticsPage,
  UpdateAnalyticsPage,
} from '../../../extensionApi/studioMain/analyticsPagesTypes';
import MainDatabaseService from '../../../extensionApi/studioMain/mainDatabaseService';

export class AnalyticsPagesService {
  static async list(connectionId: string): Promise<AnalyticsPage[]> {
    return MainDatabaseService.getAnalyticsPages(connectionId);
  }

  static async get(
    connectionId: string,
    pageId: string,
  ): Promise<AnalyticsPage> {
    return MainDatabaseService.getAnalyticsPage(connectionId, pageId);
  }

  static async create(
    connectionId: string,
    data: NewAnalyticsPage,
  ): Promise<AnalyticsPage> {
    if (!data.routePath.startsWith('/')) {
      throw new Error('routePath must start with /');
    }

    return MainDatabaseService.createAnalyticsPage(connectionId, data);
  }

  static async update(
    connectionId: string,
    pageId: string,
    updates: UpdateAnalyticsPage,
  ): Promise<AnalyticsPage> {
    if (updates.routePath !== undefined && !updates.routePath.startsWith('/')) {
      throw new Error('routePath must start with /');
    }

    return MainDatabaseService.updateAnalyticsPage(
      connectionId,
      pageId,
      updates,
    );
  }

  static async delete(connectionId: string, pageId: string): Promise<void> {
    return MainDatabaseService.deleteAnalyticsPage(connectionId, pageId);
  }
}
