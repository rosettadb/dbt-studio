import { SecureStorageAccount } from '../../types/frontend';
import { client } from '../config/client';

export const secureStorageService = {
  get: async (key: SecureStorageAccount): Promise<string | null> => {
    const { data } = await client.post<{ account: string }, string | null>(
      'secure-storage:get',
      { account: key },
    );
    return data;
  },
  set: async (key: SecureStorageAccount, value: string): Promise<void> => {
    await client.post<
      { account: SecureStorageAccount; password: string },
      void
    >('secure-storage:set', {
      account: key,
      password: value,
    });
  },
  delete: async (key: SecureStorageAccount): Promise<void> => {
    await client.post<{ account: SecureStorageAccount }, void>(
      'secure-storage:delete',
      {
        account: key,
      },
    );
  },
  list: async (): Promise<string[]> => {
    const { data } = await client.post<Record<string, never>, string[]>(
      'secure-storage:list',
      {},
    );
    return data ?? [];
  },
};
