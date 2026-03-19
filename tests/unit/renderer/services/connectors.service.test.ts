import {
  configureConnection,
  updateConnection,
  listConnections,
  testConnection,
  cancelQuery,
} from '../../../../src/renderer/services/connectors.service';
import { client } from '../../../../src/renderer/config/client';

jest.mock('../../../../src/renderer/config/client', () => {
  return {
    client: {
      get: jest.fn(),
      post: jest.fn(),
    },
  };
});

describe('renderer/services/connectors.service', () => {
  const clientMock = client as unknown as {
    get: jest.Mock;
    post: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listConnections', () => {
    it('should call client.get with connector:list and return data', async () => {
      const connections = [{ id: 'c1', type: 'postgres' }];
      clientMock.post.mockResolvedValue({
        data: connections,
      });

      const result = await listConnections();

      expect(client.post).toHaveBeenCalledWith('connector:list', undefined);
      expect(result).toEqual(connections);
    });
  });

  describe('configureConnection', () => {
    it('should call client.post with connector:configure and body and return data', async () => {
      const project = { id: 'p1', name: 'Project' };
      clientMock.post.mockResolvedValue({ data: project });

      const body = {
        id: 'p1',
        connection: { type: 'postgres' },
      } as any;

      const result = await configureConnection(body);

      expect(client.post).toHaveBeenCalledWith('connector:configure', body);
      expect(result).toEqual(project);
    });
  });

  describe('updateConnection', () => {
    it('should call client.post with connector:update and body', async () => {
      clientMock.post.mockResolvedValue({
        data: undefined,
      });

      const body = { connection: { id: 'c1', type: 'postgres' } } as any;
      await updateConnection(body);

      expect(client.post).toHaveBeenCalledWith('connector:update', body);
    });
  });

  describe('testConnection', () => {
    it('should call client.post with connector:test and body and return data', async () => {
      clientMock.post.mockResolvedValue({ data: true });

      const body = { type: 'postgres', host: 'localhost' } as any;
      const result = await testConnection(body);

      expect(client.post).toHaveBeenCalledWith('connector:test', body);
      expect(result).toBe(true);
    });
  });

  describe('cancelQuery', () => {
    it('should call client.post with connector:cancel-query and queryId', async () => {
      clientMock.post.mockResolvedValue({
        data: undefined,
      });

      await cancelQuery('q1');

      expect(client.post).toHaveBeenCalledWith('connector:cancel-query', 'q1');
    });
  });
});
