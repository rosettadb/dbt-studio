export const mockDatabaseAdapter = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  query: jest.fn(),
  getSchema: jest.fn(),
  testConnection: jest.fn(),
};
