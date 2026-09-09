import { v4 as uuidv4 } from 'uuid';
import databaseStore from '../database';
import { SavedQuery } from '../../types/backend';

export class SavedQueriesService {
  /**
   * List saved queries for a specific connection
   */
  static async list(connectionId: string): Promise<SavedQuery[]> {
    const savedQueries = await databaseStore.getField('savedQueries');
    return savedQueries?.[connectionId] || [];
  }

  /**
   * Create a new saved query
   */
  static async create(
    connectionId: string,
    name: string,
    query: string,
  ): Promise<SavedQuery> {
    const newQuery: SavedQuery = {
      id: uuidv4(),
      name,
      query,
      connectionId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await databaseStore.updateField('savedQueries', (current) => {
      const savedQueries = current || {};
      const connectionQueries = savedQueries[connectionId] || [];
      return {
        ...savedQueries,
        [connectionId]: [...connectionQueries, newQuery],
      };
    });

    return newQuery;
  }

  /**
   * Update an existing saved query
   */
  static async update(
    connectionId: string,
    queryId: string,
    updates: Partial<Pick<SavedQuery, 'name' | 'query'>>,
  ): Promise<SavedQuery> {
    let updatedQuery: SavedQuery | undefined;

    await databaseStore.updateField('savedQueries', (current) => {
      const savedQueries = current || {};
      const connectionQueries = savedQueries[connectionId] || [];

      const queryIndex = connectionQueries.findIndex((q) => q.id === queryId);
      if (queryIndex === -1) {
        throw new Error(`Saved query not found: ${queryId}`);
      }

      updatedQuery = {
        ...connectionQueries[queryIndex],
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      const updatedConnectionQueries = [...connectionQueries];
      updatedConnectionQueries[queryIndex] = updatedQuery;

      return {
        ...savedQueries,
        [connectionId]: updatedConnectionQueries,
      };
    });

    return updatedQuery as SavedQuery;
  }

  /**
   * Delete a saved query
   */
  static async delete(connectionId: string, queryId: string): Promise<void> {
    await databaseStore.updateField('savedQueries', (current) => {
      const savedQueries = current || {};
      const connectionQueries = savedQueries[connectionId] || [];
      return {
        ...savedQueries,
        [connectionId]: connectionQueries.filter((q) => q.id !== queryId),
      };
    });
  }
}
