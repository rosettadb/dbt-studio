// Stand-in for @google-cloud/spanner. Each `new Spanner()` gets its own client
// (so tests can count closes); every client shares one database double.
export const database = {
  run: jest.fn(),
  getSnapshot: jest.fn(),
  runTransactionAsync: jest.fn(),
  updateSchema: jest.fn(),
  getDatabaseDialect: jest.fn(),
};

type MockClient = { instance: jest.Mock; close: jest.Mock };

export const clients: MockClient[] = [];

export const Spanner = jest.fn<MockClient, [options?: Record<string, any>]>(
  () => {
    const client = {
      instance: jest.fn(() => ({ database: jest.fn(() => database) })),
      close: jest.fn().mockResolvedValue(undefined),
    };
    clients.push(client);
    return client;
  },
);

export const resetSpannerMock = () => {
  clients.length = 0;
  Spanner.mockClear();
  Object.values(database).forEach((fn) => fn.mockReset());
};
