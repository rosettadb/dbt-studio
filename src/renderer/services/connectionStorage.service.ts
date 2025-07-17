import { CloudConnection, RecentItem } from '../../types/frontend';

class ConnectionStorage {
  private readonly CONNECTIONS_KEY = 'cloud-connections';

  private readonly RECENT_ITEMS_KEY = 'recent-items';

  async getConnections(): Promise<CloudConnection[]> {
    try {
      const connections = localStorage.getItem(this.CONNECTIONS_KEY);
      return connections ? JSON.parse(connections) : [];
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load connections:', error);
      return [];
    }
  }

  async saveConnection(connection: CloudConnection): Promise<void> {
    try {
      const connections = await this.getConnections();
      const existingIndex = connections.findIndex(
        (c) => c.id === connection.id,
      );

      if (existingIndex >= 0) {
        connections[existingIndex] = connection;
      } else {
        connections.push(connection);
      }

      localStorage.setItem(this.CONNECTIONS_KEY, JSON.stringify(connections));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to save connection:', error);
      throw error;
    }
  }

  async deleteConnection(id: string): Promise<void> {
    try {
      const connections = await this.getConnections();
      const filteredConnections = connections.filter((c) => c.id !== id);

      localStorage.setItem(
        this.CONNECTIONS_KEY,
        JSON.stringify(filteredConnections),
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to delete connection:', error);
      throw error;
    }
  }

  async getConnection(id: string): Promise<CloudConnection | null> {
    try {
      const connections = await this.getConnections();
      return connections.find((c) => c.id === id) || null;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to get connection:', error);
      return null;
    }
  }

  async clearConnections(): Promise<void> {
    try {
      localStorage.removeItem(this.CONNECTIONS_KEY);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to clear connections:', error);
      throw error;
    }
  }

  // Recent items management
  async getRecentItems(): Promise<RecentItem[]> {
    try {
      const items = localStorage.getItem(this.RECENT_ITEMS_KEY);
      return items ? JSON.parse(items) : [];
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load recent items:', error);
      return [];
    }
  }

  async addRecentItem(item: Omit<RecentItem, 'accessedAt'>): Promise<void> {
    try {
      const items = await this.getRecentItems();
      const existingIndex = items.findIndex((i) => i.id === item.id);

      if (existingIndex >= 0) {
        items[existingIndex] = { ...item, accessedAt: new Date() };
      } else {
        items.unshift({ ...item, accessedAt: new Date() });
      }

      // Keep only last 50 items
      const recentItems = items.slice(0, 50);

      localStorage.setItem(this.RECENT_ITEMS_KEY, JSON.stringify(recentItems));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to add recent item:', error);
      throw error;
    }
  }

  async removeRecentItem(id: string): Promise<void> {
    try {
      const items = await this.getRecentItems();
      const filteredItems = items.filter((i) => i.id !== id);

      localStorage.setItem(
        this.RECENT_ITEMS_KEY,
        JSON.stringify(filteredItems),
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to remove recent item:', error);
      throw error;
    }
  }

  async clearRecentItems(): Promise<void> {
    try {
      localStorage.removeItem(this.RECENT_ITEMS_KEY);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to clear recent items:', error);
      throw error;
    }
  }
}

export const connectionStorage = new ConnectionStorage();
