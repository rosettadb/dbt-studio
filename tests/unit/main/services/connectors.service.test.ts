import fs from 'fs';
import ConnectorsService from '../../../../src/main/services/connectors.service';

const testPostgresConnection = jest.fn();

jest.mock('openai', () => ({
  OpenAI: jest.fn(),
}));

jest.mock('../../../../src/main/utils/fileHelper', () => ({
  loadDatabaseFile: jest
    .fn()
    .mockResolvedValue({ connections: [], projects: [] }),
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

describe('ConnectorsService (main)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateConnection', () => {
    it('throws when connection type is missing', async () => {
      await expect(
        ConnectorsService.validateConnection({} as any),
      ).rejects.toThrow('Connection type is required');
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

      await expect(ConnectorsService.testConnection(connection)).resolves.toBe(
        true,
      );
      expect(testPostgresConnection).toHaveBeenCalledWith(connection);
    });

    it('validates before testing (missing type fails)', async () => {
      await expect(ConnectorsService.testConnection({} as any)).rejects.toThrow(
        'Connection type is required',
      );
      expect(testPostgresConnection).not.toHaveBeenCalled();
    });
  });

  describe('BigQuery Rosetta authentication', () => {
    it('generates a service-account JDBC URL using runtime environment values', async () => {
      const url = await ConnectorsService.generateJdbcUrl({
        type: 'bigquery',
        name: 'bigquery_01',
        project: 'analytics-project',
      } as any);

      expect(url).toBe(
        `jdbc:bigquery://https://www.googleapis.com/bigquery/v2:443;ProjectId=\${db-project-bigquery_01};OAuthType=0;OAuthServiceAcctEmail=\${db-bigquery-email-bigquery_01};OAuthPvtKeyPath=\${db-bigquery-bigquery_01};`,
      );
    });

    it('materializes the service-account key as a protected temporary file', async () => {
      const writeFileSpy = jest
        .spyOn(fs.promises, 'writeFile')
        .mockResolvedValue(undefined);
      const key = 'db-bigquery-bigquery_01';
      const emailKey = 'db-bigquery-email-bigquery_01';
      const serviceAccount = JSON.stringify({
        client_email: 'service@example.iam.gserviceaccount.com',
        private_key: 'private-key',
      });

      try {
        await ConnectorsService.setConnectionEnvVariable(key, serviceAccount);

        expect(writeFileSpy).toHaveBeenCalledWith(
          expect.stringMatching(/rosetta-bigquery-.*\.json$/),
          serviceAccount,
          { encoding: 'utf8', mode: 0o600 },
        );
        expect(process.env[key]).toMatch(/rosetta-bigquery-.*\.json$/);
        expect(process.env[emailKey]).toBe(
          'service@example.iam.gserviceaccount.com',
        );
        expect(process.env[key]).not.toBe(serviceAccount);
      } finally {
        writeFileSpy.mockRestore();
        delete process.env[key];
        delete process.env[emailKey];
      }
    });
  });
});
