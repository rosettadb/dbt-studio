import { ipcMain } from 'electron';
import { ConnectorsService } from '../services';
import type { ConnectionInput, QueryResponseType } from '../../types/backend';
import { ConfigureConnectionBody, UpdateConnectionBody } from '../../types/ipc';
import { CloudConnection, RecentItem } from '../../types/frontend';

const handlerChannels = [
  'connector:configure',
  'connector:test',
  'connector:validate',
  'connector:getJdbcUrl',
  'connector:query',
  'connector:list',
];

const removeConnectorsIpcHandlers = () => {
  handlerChannels.forEach((channel) => {
    ipcMain.removeHandler(channel);
  });
};

const registerConnectorsHandlers = () => {
  removeConnectorsIpcHandlers();
  ipcMain.handle(
    'connector:configure',
    async (_event, body: ConfigureConnectionBody) => {
      return ConnectorsService.configureConnection(body);
    },
  );

  ipcMain.handle('connector:list', async () => {
    return ConnectorsService.loadConnections();
  });

  ipcMain.handle('connector:get', async (_event, connectionId: string) => {
    return ConnectorsService.getConnectionById(connectionId);
  });

  ipcMain.handle('connector:test', async (_event, body: ConnectionInput) => {
    return ConnectorsService.testConnection(body);
  });

  ipcMain.handle(
    'connector:update',
    async (_event, body: UpdateConnectionBody) => {
      return ConnectorsService.updateConnection(body);
    },
  );

  ipcMain.handle('connector:delete', async (_event, connectionId: string) => {
    return ConnectorsService.deleteConnection(connectionId);
  });

  ipcMain.handle(
    'connector:validate',
    async (_event, connection: ConnectionInput) => {
      try {
        ConnectorsService.validateConnection(connection);
        return { valid: true };
      } catch (error: any) {
        const errorMessage =
          error?.message || error?.toString() || 'Validation failed';
        return { valid: false, error: errorMessage };
      }
    },
  );

  ipcMain.handle(
    'connector:query',
    async (
      _event,
      body: { connection: ConnectionInput; query: string; projectName: string },
    ): Promise<QueryResponseType> => {
      try {
        return ConnectorsService.executeSelectStatement(body);
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  );

  ipcMain.handle(
    'connector:setConnectionEnvVariable',
    async (_event, { key, value }: { key: string; value: string }) => {
      return ConnectorsService.setConnectionEnvVariable(key, value);
    },
  );

  ipcMain.handle('source:create', async (_event, body: CloudConnection) => {
    return ConnectorsService.saveCloudConnection(body);
  });

  ipcMain.handle('source:list', async () => {
    return ConnectorsService.loadCloudConnections();
  });

  ipcMain.handle('source:get', async (_event, id: string) => {
    return ConnectorsService.getCloudConnectionById(id);
  });

  ipcMain.handle('source:delete', async (_event, id: string) => {
    return ConnectorsService.deleteCloudConnection(id);
  });

  ipcMain.handle('source:recentItems', async () => {
    return ConnectorsService.loadRecentItems();
  });

  ipcMain.handle(
    'source:addRecentItem',
    async (_event, item: Omit<RecentItem, 'accessedAt'>) => {
      return ConnectorsService.addRecentItem(item);
    },
  );

  ipcMain.handle('source:clearRecentItems', async () => {
    return ConnectorsService.clearRecentItems();
  });

  ipcMain.handle('source:deleteRecentItem', async (_event, id: string) => {
    return ConnectorsService.removeRecentItem(id);
  });
};

export default registerConnectorsHandlers;
