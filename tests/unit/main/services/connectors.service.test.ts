const testPostgresConnection = jest.fn();

jest.mock('openai', () => ({
  OpenAI: jest.fn(),
}));

jest.mock('../../../../src/main/utils/fileHelper', () => ({
  loadDatabaseFile: jest.fn().mockResolvedValue({ connections: [], projects: [] }),
  updateDatabase: jest.fn(),
}));

jest.mock('../../../../src/main/services/index', () => ({
  ProjectsService: {
    loadProjects: jest.fn().mockResolvedValue([]),
    updateProject: jest.fn(),
  },
}));

jest.mock('../../../../src/main/services/secureStorage.service', () => ({
  __esModule: true,
  default: {
    setCredential: jest.fn(),
    getCredential: jest.fn(),
    deleteCredential: jest.fn(),
  },
}));

jest.mock('../../../../src/main/utils/connectors', () => ({
  executeBigQueryQuery: jest.fn(),
  executeDatabricksQuery: jest.fn(),
  executeDuckDBQuery: jest.fn(),
  executePostgresQuery: jest.fn(),
  executeRedshiftQuery: jest.fn(),
  executeSnowflakeQuery: jest.fn(),
  testBigQueryConnection: jest.fn(),
  testDatabricksConnection: jest.fn(),
  testDuckDBConnection: jest.fn(),
  testPostgresConnection: (...args: any[]) => testPostgresConnection(...args),
  testRedshiftConnection: jest.fn(),
  testSnowflakeConnection: jest.fn(),
}));

import ConnectorsService from '../../../../src/main/services/connectors.service';

describe('ConnectorsService (main)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateConnection', () => {
    it('throws when connection type is missing', async () => {
      await expect(ConnectorsService.validateConnection({} as any)).rejects.toThrow(
        'Connection type is required',
      );
    });
  });

  describe('testConnection', () => {
    it('calls testPostgresConnection for postgres connections', async () => {
      testPostgresConnection.mockResolvedValue(true);

      const connection = {
        type: 'postgres',
        name: 'test',
        host: 'localhost',
        user: 'user',
        port: 5432,
        database: 'db',
        password: 'pw',
      } as any;

      await expect(ConnectorsService.testConnection(connection)).resolves.toBe(true);
      expect(testPostgresConnection).toHaveBeenCalledWith(connection);
    });

    it('validates before testing (missing type fails)', async () => {
      await expect(ConnectorsService.testConnection({} as any)).rejects.toThrow(
        'Connection type is required',
      );
      expect(testPostgresConnection).not.toHaveBeenCalled();
    });
  });
});
