import { v4 as uuidv4 } from 'uuid';
import { loadDatabaseFile, updateDatabase } from '../utils/fileHelper';
import { SavedQuery } from '../../types/backend';

export class SavedQueriesService {
  /**
   * List saved queries for a specific connection
   */
  static async list(connectionId: string): Promise<SavedQuery[]> {
    const db = await loadDatabaseFile();
    const savedQueries = db.savedQueries || {};
    return savedQueries[connectionId] || [];
  }

  /**
   * Create a new saved query
   */
  static async create(
    connectionId: string,
    name: string,
    query: string,
  ): Promise<SavedQuery> {
    const db = await loadDatabaseFile();
    const savedQueries = db.savedQueries || {};
    const connectionQueries = savedQueries[connectionId] || [];

    const newQuery: SavedQuery = {
      id: uuidv4(),
      name,
      query,
      connectionId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updatedConnectionQueries = [...connectionQueries, newQuery];

    await updateDatabase('savedQueries', {
      ...savedQueries,
      [connectionId]: updatedConnectionQueries,
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
    const db = await loadDatabaseFile();
    const savedQueries = db.savedQueries || {};
    const connectionQueries = savedQueries[connectionId] || [];

    const queryIndex = connectionQueries.findIndex((q) => q.id === queryId);
    if (queryIndex === -1) {
      throw new Error(`Saved query not found: ${queryId}`);
    }

    const updatedQuery: SavedQuery = {
      ...connectionQueries[queryIndex],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    const updatedConnectionQueries = [...connectionQueries];
    updatedConnectionQueries[queryIndex] = updatedQuery;

    await updateDatabase('savedQueries', {
      ...savedQueries,
      [connectionId]: updatedConnectionQueries,
    });

    return updatedQuery;
  }

  /**
   * Delete a saved query
   */
  static async delete(connectionId: string, queryId: string): Promise<void> {
    const db = await loadDatabaseFile();
    const savedQueries = db.savedQueries || {};
    const connectionQueries = savedQueries[connectionId] || [];

    const updatedConnectionQueries = connectionQueries.filter(
      (q) => q.id !== queryId,
    );

    await updateDatabase('savedQueries', {
      ...savedQueries,
      [connectionId]: updatedConnectionQueries,
    });
  }
}
