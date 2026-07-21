import {
  AnalyticsPage,
  NewAnalyticsPage,
  UpdateAnalyticsPage,
} from '../../types/analyticsPages';

export class AnalyticsPagesService {
  static async list(connectionId: string): Promise<AnalyticsPage[]> {
    return window.electron.ipcRenderer.invoke(
      'analyticsPages:list',
      connectionId,
    );
  }

  /**
   * Fetch a single page without loading all pages from disk.
   * Used by AI tools and any component that needs one page by ID.
   */
  static async get(
    connectionId: string,
    pageId: string,
  ): Promise<AnalyticsPage> {
    return window.electron.ipcRenderer.invoke('analyticsPages:get', {
      connectionId,
      pageId,
    });
  }

  static async create(
    connectionId: string,
    data: NewAnalyticsPage,
  ): Promise<AnalyticsPage> {
    return window.electron.ipcRenderer.invoke('analyticsPages:create', {
      connectionId,
      data,
    });
  }

  static async update(
    connectionId: string,
    pageId: string,
    updates: UpdateAnalyticsPage,
  ): Promise<AnalyticsPage> {
    return window.electron.ipcRenderer.invoke('analyticsPages:update', {
      connectionId,
      pageId,
      updates,
    });
  }

  static async delete(connectionId: string, pageId: string): Promise<void> {
    return window.electron.ipcRenderer.invoke('analyticsPages:delete', {
      connectionId,
      pageId,
    });
  }
}
