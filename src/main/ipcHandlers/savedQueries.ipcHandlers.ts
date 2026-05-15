import { ipcMain } from 'electron';
import { SavedQueriesService } from '../services/savedQueries.service';

const handlerChannels = [
  'savedQueries:list',
  'savedQueries:create',
  'savedQueries:update',
  'savedQueries:delete',
];

const removeSavedQueriesIpcHandlers = () => {
  handlerChannels.forEach((channel) => {
    ipcMain.removeHandler(channel);
  });
};

const registerSavedQueriesHandlers = () => {
  removeSavedQueriesIpcHandlers();

  ipcMain.handle('savedQueries:list', async (_event, connectionId: string) => {
    return SavedQueriesService.list(connectionId);
  });

  ipcMain.handle(
    'savedQueries:create',
    async (
      _event,
      {
        connectionId,
        name,
        query,
      }: {
        connectionId: string;
        name: string;
        query: string;
      },
    ) => {
      return SavedQueriesService.create(connectionId, name, query);
    },
  );

  ipcMain.handle(
    'savedQueries:update',
    async (
      _event,
      {
        connectionId,
        queryId,
        updates,
      }: {
        connectionId: string;
        queryId: string;
        updates: { name?: string; query?: string };
      },
    ) => {
      return SavedQueriesService.update(connectionId, queryId, updates);
    },
  );

  ipcMain.handle(
    'savedQueries:delete',
    async (
      _event,
      { connectionId, queryId }: { connectionId: string; queryId: string },
    ) => {
      return SavedQueriesService.delete(connectionId, queryId);
    },
  );
};

export default registerSavedQueriesHandlers;
