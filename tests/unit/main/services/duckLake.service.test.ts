const initializeStore = jest.fn();
const loadInstances = jest.fn();
const getInstance = jest.fn();
const saveInstance = jest.fn();
const deleteInstance = jest.fn();
const retrieveCredentials = jest.fn();
const getStorageStats = jest.fn();

jest.mock('../../../../src/main/services/duckLake/instanceStore.service', () => ({
  __esModule: true,
  default: {
    initialize: (...args: any[]) => initializeStore(...args),
    loadInstances: (...args: any[]) => loadInstances(...args),
    getInstance: (...args: any[]) => getInstance(...args),
    saveInstance: (...args: any[]) => saveInstance(...args),
    deleteInstance: (...args: any[]) => deleteInstance(...args),
    retrieveCredentials: (...args: any[]) => retrieveCredentials(...args),
    getStorageStats: (...args: any[]) => getStorageStats(...args),
  },
}));

const validateCreateRequest = jest.fn();
const validateUpdateRequest = jest.fn();
const validateDataPathAccess = jest.fn();
const validateCatalogPathAccess = jest.fn();
const validateStorageConfig = jest.fn();

jest.mock('../../../../src/main/services/duckLake/validation.service', () => ({
  __esModule: true,
  default: {
    validateCreateRequest: (...args: any[]) => validateCreateRequest(...args),
    validateUpdateRequest: (...args: any[]) => validateUpdateRequest(...args),
    validateDataPathAccess: (...args: any[]) => validateDataPathAccess(...args),
    validateCatalogPathAccess: (...args: any[]) => validateCatalogPathAccess(...args),
    validateStorageConfig: (...args: any[]) => validateStorageConfig(...args),
  },
}));

const isExtensionAvailable = jest.fn();
const initializeExtension = jest.fn();

jest.mock('../../../../src/main/services/duckLake/extensionManager.service', () => ({
  __esModule: true,
  default: {
    initialize: (...args: any[]) => initializeExtension(...args),
    isExtensionAvailable: (...args: any[]) => isExtensionAvailable(...args),
  },
}));

const cmInitialize = jest.fn();
const getConnectionStatus = jest.fn();
const cmGetConnection = jest.fn();
const cmDisconnect = jest.fn();

jest.mock('../../../../src/main/services/duckLake/connectionManager.service', () => ({
  __esModule: true,
  default: {
    initialize: (...args: any[]) => cmInitialize(...args),
    getConnectionStatus: (...args: any[]) => getConnectionStatus(...args),
    getConnection: (...args: any[]) => cmGetConnection(...args),
    disconnect: (...args: any[]) => cmDisconnect(...args),
  },
}));

const createAdapter = jest.fn();

jest.mock('../../../../src/main/services/duckLake/adapters', () => ({
  CatalogAdapterFactory: {
    createAdapter: (...args: any[]) => createAdapter(...args),
  },
}));

const cloudTestConnection = jest.fn();

jest.mock('../../../../src/main/services/cloudExplorer.service', () => ({
  __esModule: true,
  default: {
    testConnection: (...args: any[]) => cloudTestConnection(...args),
  },
}));

import DuckLakeService from '../../../../src/main/services/duckLake.service';

describe('DuckLakeService (main)', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    initializeStore.mockResolvedValue(undefined);
    initializeExtension.mockResolvedValue(undefined);
    cmInitialize.mockReturnValue(undefined);

    isExtensionAvailable.mockReturnValue(true);

    getConnectionStatus.mockReturnValue({ connected: true });
    retrieveCredentials.mockResolvedValue({ catalog: { type: 'duckdb' }, storage: undefined });

    const adapter = {
      executeQuery: jest.fn(),
      listTables: jest.fn(),
      getTable: jest.fn(),
      listSnapshots: jest.fn(),
      listInstanceSnapshots: jest.fn(),
      getTableDetails: jest.fn(),
    };
    cmGetConnection.mockResolvedValue(adapter);

    createAdapter.mockReturnValue({
      testConnection: jest.fn().mockResolvedValue({ connected: true }),
    });
  });

  describe('listInstances', () => {
    it('initializes once and delegates to DuckLakeInstanceStore.loadInstances', async () => {
      loadInstances.mockResolvedValue([{ id: 'i1' }]);

      await expect(DuckLakeService.listInstances()).resolves.toEqual([{ id: 'i1' }]);

      expect(initializeStore).toHaveBeenCalled();
      expect(initializeExtension).toHaveBeenCalled();
      expect(loadInstances).toHaveBeenCalled();
    });
  });

  describe('createInstance', () => {
    it('validates request, saves instance, and returns inactive instance', async () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.123456789);

      const request = {
        name: 'demo',
        dataPath: '/tmp/data',
        catalog: { type: 'duckdb', duckdb: { metadataPath: '/tmp/meta.db' } },
        storage: { type: 'local', local: { path: '/tmp/data' } },
      } as any;

      const instance = await DuckLakeService.createInstance(request);

      expect(validateCreateRequest).toHaveBeenCalledWith(request);
      expect(validateDataPathAccess).toHaveBeenCalledWith('/tmp/data');
      expect(validateCatalogPathAccess).toHaveBeenCalledWith(request.catalog);

      expect(saveInstance).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'demo',
          dataPath: '/tmp/data',
          status: 'inactive',
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
      );

      expect(instance.id).toMatch(/^ducklake_1700000000000_/);
      expect(instance.status).toBe('inactive');

      nowSpy.mockRestore();
      randomSpy.mockRestore();
    });
  });

  describe('validateStorageConnection', () => {
    it('delegates s3 storage testing to CloudExplorerService.testConnection', async () => {
      cloudTestConnection.mockResolvedValue(true);

      const result = await DuckLakeService.validateStorageConnection({
        type: 's3',
        s3: {
          region: 'us-east-1',
          accessKeyId: 'ak',
          secretAccessKey: 'sk',
        },
      } as any);

      expect(validateStorageConfig).toHaveBeenCalled();
      expect(cloudTestConnection).toHaveBeenCalledWith('aws', {
        region: 'us-east-1',
        accessKeyId: 'ak',
        secretAccessKey: 'sk',
      });
      expect(result).toEqual({ success: true });
    });

    it('returns {success:false,error} when CloudExplorerService.testConnection throws', async () => {
      cloudTestConnection.mockImplementation(async () => {
        throw new Error('bad creds');
      });

      const result = await DuckLakeService.validateStorageConnection({
        type: 's3',
        s3: {
          region: 'us-east-1',
          accessKeyId: 'ak',
          secretAccessKey: 'sk',
        },
      } as any);

      expect(result).toEqual({ success: false, error: 'bad creds' });
    });
  });
});
