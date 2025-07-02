import { client } from '../config/client';

export const secureStorageService = {
  get: async (key: string): Promise<string | null> => {
    const { data } = await client.post<{ key: string }, string | null>(
      'secure-storage:get',
      { key },
    );
    return data;
  },
  set: async (key: string, value: string): Promise<void> => {
    await client.post<{ key: string; value: string }, void>(
      'secure-storage:set',
      {
        key,
        value,
      },
    );
  },
  delete: async (key: string): Promise<void> => {
    await client.post<{ key: string }, void>('secure-storage:delete', {
      key,
    });
  },
};
