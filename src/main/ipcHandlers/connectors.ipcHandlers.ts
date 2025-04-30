import { ipcMain } from 'electron';
import { ConnectorsService } from '../services';
import type { ConnectionInput, QueryResponseType } from '../../types/backend';
import { ConfigureConnectionBody } from '../../types/ipc';

const handlerChannels = [
  'connector:configure',
  'connector:test',
  'connector:validate',
  'connector:getJdbcUrl',
  'connector:query',
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

  ipcMain.handle('connector:test', async (_event, body: ConnectionInput) => {
    return ConnectorsService.testConnection(body);
  });

  ipcMain.handle(
    'connector:validate',
    async (_event, connection: ConnectionInput) => {
      try {
        ConnectorsService.validateConnection(connection);
        return { valid: true };
      } catch (error) {
        return { valid: false, error: (error as Error).message };
      }
    },
  );

  ipcMain.handle(
    'connector:getJdbcUrl',
    async (_event, connection: ConnectionInput) => {
      return ConnectorsService.generateJdbcUrl(connection);
    },
  );

  ipcMain.handle(
    'connector:query',
    async (
      _event,
      body: { connection: ConnectionInput; query: string },
    ): Promise<QueryResponseType> => {
      try {
        return ConnectorsService.executeSelectStatement(body);
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  );
};

export default registerConnectorsHandlers;
