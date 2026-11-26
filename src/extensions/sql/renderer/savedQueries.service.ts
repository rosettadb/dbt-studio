import { SavedQuery } from '../../../extensionApi/studio/types';
import { ipc } from './ipc';

export class SavedQueriesService {
  static async list(connectionId: string): Promise<SavedQuery[]> {
    return ipc.invoke('savedQueries:list', connectionId);
  }

  static async create(
    connectionId: string,
    name: string,
    query: string,
  ): Promise<SavedQuery> {
    return ipc.invoke('savedQueries:create', {
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
    return ipc.invoke('savedQueries:update', {
      connectionId,
      queryId,
      updates,
    });
  }

  static async delete(connectionId: string, queryId: string): Promise<void> {
    return ipc.invoke('savedQueries:delete', {
      connectionId,
      queryId,
    });
  }
}
