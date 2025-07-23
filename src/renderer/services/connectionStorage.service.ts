import { CloudConnection, RecentItem } from '../../types/frontend';
import { client } from '../config/client';

class ConnectionStorage {
  private readonly CONNECTIONS_KEY = 'cloud-connections';

  private readonly RECENT_ITEMS_KEY = 'recent-items';

  // eslint-disable-next-line class-methods-use-this
  async getConnections(): Promise<CloudConnection[]> {
    const { data } = await client.get<CloudConnection[]>('source:list');
    return data;
  }

  // eslint-disable-next-line class-methods-use-this
  async saveConnection(connection: CloudConnection): Promise<void> {
    await client.post<CloudConnection>('source:create', connection);
  }

  // eslint-disable-next-line class-methods-use-this
  async deleteConnection(id: string): Promise<void> {
    await client.post<string>('source:delete', id);
  }

  // eslint-disable-next-line class-methods-use-this
  async getConnection(id: string): Promise<CloudConnection | null> {
    const { data } = await client.post<string, CloudConnection>(
      'source:get',
      id,
    );
    return data;
  }

  // eslint-disable-next-line class-methods-use-this
  async getRecentItems(): Promise<RecentItem[]> {
    const { data } = await client.get<RecentItem[]>('source:recentItems');
    return data;
  }

  // eslint-disable-next-line class-methods-use-this
  async addRecentItem(item: Omit<RecentItem, 'accessedAt'>): Promise<void> {
    await client.post<Omit<RecentItem, 'accessedAt'>>(
      'source:addRecentItem',
      item,
    );
  }

  // eslint-disable-next-line class-methods-use-this
  async removeRecentItem(id: string): Promise<void> {
    await client.post<string>('source:deleteRecentItem', id);
  }

  // eslint-disable-next-line class-methods-use-this
  async clearRecentItems(): Promise<void> {
    await client.get('source:clearRecentItems');
  }
}

export const connectionStorage = new ConnectionStorage();
