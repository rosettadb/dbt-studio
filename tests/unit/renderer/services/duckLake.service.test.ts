import { DuckLakeService } from '../../../../src/renderer/services/duckLake.service';

describe('renderer/services/duckLake.service', () => {
  const invokeMock = () => (window as any).electron.ipcRenderer.invoke as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadExtension', () => {
    it('should invoke ducklake:extension:load', async () => {
      invokeMock().mockResolvedValue(undefined);

      await DuckLakeService.loadExtension();

      expect(invokeMock()).toHaveBeenCalledWith('ducklake:extension:load');
    });

    it('should propagate IPC errors', async () => {
      invokeMock().mockRejectedValue(new Error('boom'));

      await expect(DuckLakeService.loadExtension()).rejects.toThrow('boom');
    });
  });

  describe('verifyExtension', () => {
    it('should invoke ducklake:extension:verify and return boolean', async () => {
      invokeMock().mockResolvedValue(true);

      const result = await DuckLakeService.verifyExtension();

      expect(invokeMock()).toHaveBeenCalledWith('ducklake:extension:verify');
      expect(result).toBe(true);
    });
  });

  describe('instance management', () => {
    it('listInstances should invoke ducklake:instance:list and return data', async () => {
      const instances = [{ id: 'i1', name: 'Instance 1' }];
      invokeMock().mockResolvedValue(instances);

      const result = await DuckLakeService.listInstances();

      expect(invokeMock()).toHaveBeenCalledWith('ducklake:instance:list');
      expect(result).toEqual(instances);
    });

    it('updateInstance should invoke ducklake:instance:update with {id,data}', async () => {
      const updated = { id: 'i1', name: 'Updated' };
      invokeMock().mockResolvedValue(updated);

      const result = await DuckLakeService.updateInstance('i1', { name: 'Updated' } as any);

      expect(invokeMock()).toHaveBeenCalledWith('ducklake:instance:update', {
        id: 'i1',
        data: { name: 'Updated' },
      });
      expect(result).toEqual(updated);
    });

    it('listInstanceSnapshots should pass params when provided', async () => {
      const data = { items: [], total: 0 };
      const params = { limit: 10, offset: 0 };
      invokeMock().mockResolvedValue(data);

      const result = await DuckLakeService.listInstanceSnapshots('i1', params as any);

      expect(invokeMock()).toHaveBeenCalledWith('ducklake:instance:listSnapshots', 'i1', params);
      expect(result).toEqual(data);
    });

    it('listInstanceSnapshots should pass undefined params when omitted', async () => {
      const data = { items: [], total: 0 };
      invokeMock().mockResolvedValue(data);

      await DuckLakeService.listInstanceSnapshots('i1');

      expect(invokeMock()).toHaveBeenCalledWith('ducklake:instance:listSnapshots', 'i1', undefined);
    });
  });

  describe('maintenance operations', () => {
    it('optimizeInstance should pass tableName when provided', async () => {
      const task = { id: 't1' };
      invokeMock().mockResolvedValue(task);

      const result = await DuckLakeService.optimizeInstance('i1', 'my_table');

      expect(invokeMock()).toHaveBeenCalledWith(
        'ducklake:maintenance:optimize',
        'i1',
        'my_table',
      );
      expect(result).toEqual(task);
    });

    it('optimizeInstance should pass undefined tableName when omitted', async () => {
      const task = { id: 't1' };
      invokeMock().mockResolvedValue(task);

      await DuckLakeService.optimizeInstance('i1');

      expect(invokeMock()).toHaveBeenCalledWith(
        'ducklake:maintenance:optimize',
        'i1',
        undefined,
      );
    });
  });

  describe('cloud connections', () => {
    it('testCloudConnection should invoke ducklake:connection:test with provider + config', async () => {
      invokeMock().mockResolvedValue(true);

      const result = await DuckLakeService.testCloudConnection('aws', { region: 'us-east-1' });

      expect(invokeMock()).toHaveBeenCalledWith('ducklake:connection:test', {
        provider: 'aws',
        config: { region: 'us-east-1' },
      });
      expect(result).toBe(true);
    });
  });
});
