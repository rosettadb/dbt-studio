import { SavedQuery } from '../../types/backend';

export class SavedQueriesService {
  static async list(connectionId: string): Promise<SavedQuery[]> {
    return window.electron.ipcRenderer.invoke(
      'savedQueries:list',
      connectionId,
    );
  }

  static async create(
    connectionId: string,
    name: string,
    query: string,
  ): Promise<SavedQuery> {
    return window.electron.ipcRenderer.invoke('savedQueries:create', {
      connectionId,
      name,
      query,
    });
  }

  static async update(
    connectionId: string,
    queryId: string,
    updates: { name?: string; query?: string },
  ): Promise<SavedQuery> {
    return window.electron.ipcRenderer.invoke('savedQueries:update', {
      connectionId,
      queryId,
      updates,
    });
  }

  static async delete(connectionId: string, queryId: string): Promise<void> {
    return window.electron.ipcRenderer.invoke('savedQueries:delete', {
      connectionId,
      queryId,
    });
  }
}
