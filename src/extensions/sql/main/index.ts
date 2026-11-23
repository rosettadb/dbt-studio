import type {
  ExtensionMainApi,
  ExtensionMainModule,
} from '../../../extensionApi/main';
import { SavedQueriesService } from './savedQueries.service';

/**
 * Main-process half of the SQL Editor extension: the saved queries of each
 * connection. Running queries is Studio's connections layer.
 */

const activate = (api: ExtensionMainApi): void => {
  api.ipc.handle('savedQueries:list', async (_event, connectionId: string) => {
    return SavedQueriesService.list(connectionId);
  });

  api.ipc.handle(
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

  api.ipc.handle(
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

  api.ipc.handle(
    'savedQueries:delete',
    async (
      _event,
      { connectionId, queryId }: { connectionId: string; queryId: string },
    ) => {
      return SavedQueriesService.delete(connectionId, queryId);
    },
  );
};

export const sqlMain: ExtensionMainModule = { activate };
