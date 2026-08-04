import fs from 'fs';
import ConnectorsService from '../../../../src/main/services/connectors.service';

const testPostgresConnection = jest.fn();
const getCredential = jest.fn();
const setCredential = jest.fn();
const deleteCredential = jest.fn();
const updateDatabase = jest.fn();

jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/tmp/dbt-studio-test'),
  },
}));

jest.mock('../../../../src/main/services/notebooks.service', () => ({
  NotebooksService: {
    archiveConnectionNotebooks: jest.fn(),
  },
}));

jest.mock('../../../../src/main/services/duckLake.service', () => ({
  __esModule: true,
  default: {},
}));

jest.mock(
  '../../../../src/main/services/duckLake/instanceStore.service',
  () => ({
    __esModule: true,
    default: {},
  }),
);

jest.mock('../../../../src/main/services/dbtCoreVersion.service', () => ({
  DbtCoreVersionService: {
    runManagedDbtDebug: jest.fn(),
  },
}));

jest.mock('openai', () => ({
  OpenAI: jest.fn(),
}));

jest.mock('../../../../src/main/utils/fileHelper', () => ({
  loadDatabaseFile: jest
    .fn()
    .mockResolvedValue({ connections: [], projects: [] }),
  updateDatabase: (...args: any[]) => updateDatabase(...args),
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
    setCredential: (...args: any[]) => setCredential(...args),
    getCredential: (...args: any[]) => getCredential(...args),
    deleteCredential: (...args: any[]) => deleteCredential(...args),
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
    getCredential.mockReset();
  });

  describe('validateConnection', () => {
    it('throws when connection type is missing', async () => {
      await expect(
        ConnectorsService.validateConnection({} as any),
      ).rejects.toThrow('Connection type is required');
    });

    it('rejects unknown runtime connection types with a stable error', async () => {
      await expect(
        ConnectorsService.validateConnection({ type: 'future-adapter' } as any),
      ).rejects.toThrow('UNSUPPORTED_CONNECTION_TYPE');
    });

    it('validates the Microsoft Fabric connection contract', async () => {
      const connection = {
        type: 'fabricspark',
        name: 'Fabric Lakehouse',
        endpoint: 'https://api.fabric.microsoft.com/v1',
        workspaceId: '11111111-1111-4111-8111-111111111111',
        lakehouseId: '22222222-2222-4222-8222-222222222222',
        lakehouse: 'analytics',
        schemaMode: 'schema-enabled',
        schema: 'dbo',
        authentication: 'CLI',
        threads: 1,
        reuseSession: true,
      } as const;

      await expect(
        ConnectorsService.validateConnection(connection),
      ).resolves.toBeUndefined();
      await expect(
        ConnectorsService.validateConnection({
          ...connection,
          endpoint: 'https://example.com',
        }),
      ).rejects.toThrow('Unsupported Microsoft Fabric API endpoint');
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

    it('does not fall through to another adapter for invalid Fabric input', async () => {
      await expect(
        ConnectorsService.testConnection({ type: 'fabricspark' } as any),
      ).rejects.toThrow('Connection name is required');
      expect(testPostgresConnection).not.toHaveBeenCalled();
    });
  });

  describe('Fabric secure persistence', () => {
    it('stores the SPN secret by connection ID and persists only its presence', async () => {
      const connection = {
        type: 'fabricspark',
        name: 'Fabric SPN',
        endpoint: 'https://api.fabric.microsoft.com/v1',
        workspaceId: '11111111-1111-4111-8111-111111111111',
        lakehouseId: '22222222-2222-4222-8222-222222222222',
        lakehouse: 'analytics',
        schemaMode: 'schema-enabled',
        schema: 'dbo',
        authentication: 'SPN',
        clientId: '33333333-3333-4333-8333-333333333333',
        tenantId: '44444444-4444-4444-8444-444444444444',
        threads: 1,
        reuseSession: true,
        highConcurrency: false,
      } as const;

      const connectionId = await ConnectorsService.saveNewConnection(
        connection,
        { clientSecret: 'top-secret' },
      );

      expect(setCredential).toHaveBeenCalledWith(
        `db-fabricspark-client-secret-${connectionId}`,
        'top-secret',
      );
      const lastCall =
        updateDatabase.mock.calls[updateDatabase.mock.calls.length - 1];
      const persisted = lastCall[1];
      expect(persisted[0].connection).toMatchObject({
        type: 'fabricspark',
        hasClientSecret: true,
      });
      expect(JSON.stringify(persisted)).not.toContain('top-secret');
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

    it('registers BigQuery cleanup once for exit and termination signals', () => {
      const service = ConnectorsService as unknown as {
        isBigQueryCleanupRegistered: boolean;
        registerBigQueryCleanup: () => void;
      };
      const onceSpy = jest.spyOn(process, 'once').mockReturnValue(process);

      try {
        service.isBigQueryCleanupRegistered = false;
        service.registerBigQueryCleanup();
        service.registerBigQueryCleanup();

        expect(onceSpy.mock.calls.map(([event]) => event)).toEqual([
          'exit',
          'SIGINT',
          'SIGTERM',
        ]);
      } finally {
        onceSpy.mockRestore();
      }
    });

    it('materializes the service-account key as a protected temporary file', async () => {
      const writeFileSpy = jest
        .spyOn(fs.promises, 'writeFile')
        .mockResolvedValue(undefined);
      const rmSyncSpy = jest.spyOn(fs, 'rmSync').mockImplementation(() => {});
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
        ConnectorsService.cleanupBigQueryKeyFiles();
        writeFileSpy.mockRestore();
        rmSyncSpy.mockRestore();
        delete process.env[key];
        delete process.env[emailKey];
      }
    });

    it('materializes both service-account variables before loading configs', async () => {
      const serviceAccount = JSON.stringify({
        client_email: 'saved@example.iam.gserviceaccount.com',
        private_key: 'private-key',
      });
      getCredential.mockResolvedValue(serviceAccount);
      const project = {
        id: 'project-1',
        name: 'Project',
        path: '/projects/project-1',
        connectionId: 'connection-1',
      } as any;
      const connection = {
        id: 'connection-1',
        connection: {
          type: 'bigquery',
          name: 'saved-bigquery',
          method: 'service-account',
          project: 'analytics-project',
          database: 'analytics-project',
          schema: 'analytics',
          dataset: 'analytics',
          username: '',
          password: '',
        },
      } as any;
      const projectSpy = jest
        .spyOn(ConnectorsService, 'getProjectById')
        .mockResolvedValue(project);
      const connectionsSpy = jest
        .spyOn(ConnectorsService, 'loadConnections')
        .mockResolvedValue([connection]);
      const writeFileSpy = jest
        .spyOn(fs.promises, 'writeFile')
        .mockResolvedValue(undefined);
      const mkdirSpy = jest
        .spyOn(fs.promises, 'mkdir')
        .mockResolvedValue(undefined);
      const rmSyncSpy = jest.spyOn(fs, 'rmSync').mockImplementation(() => {});

      try {
        await ConnectorsService.loadConfigurations(project.id);

        expect(getCredential).toHaveBeenCalledWith(
          'db-bigquery-saved-bigquery',
        );
        expect(process.env['db-bigquery-saved-bigquery']).toMatch(
          /rosetta-bigquery-.*\.json$/,
        );
        expect(process.env['db-bigquery-email-saved-bigquery']).toBe(
          'saved@example.iam.gserviceaccount.com',
        );
      } finally {
        ConnectorsService.cleanupBigQueryKeyFiles();
        projectSpy.mockRestore();
        connectionsSpy.mockRestore();
        writeFileSpy.mockRestore();
        mkdirSpy.mockRestore();
        rmSyncSpy.mockRestore();
      }
    });

    it('removes all tracked service-account files and environment values', async () => {
      const writeFileSpy = jest
        .spyOn(fs.promises, 'writeFile')
        .mockResolvedValue(undefined);
      const rmSyncSpy = jest.spyOn(fs, 'rmSync').mockImplementation(() => {});
      const serviceAccount = JSON.stringify({
        client_email: 'cleanup@example.iam.gserviceaccount.com',
        private_key: 'private-key',
      });

      try {
        await ConnectorsService.setConnectionEnvVariable(
          'db-bigquery-first',
          serviceAccount,
        );
        await ConnectorsService.setConnectionEnvVariable(
          'db-bigquery-second',
          serviceAccount,
        );
        const paths = [
          process.env['db-bigquery-first'],
          process.env['db-bigquery-second'],
        ];

        ConnectorsService.cleanupBigQueryKeyFiles();

        paths.forEach((keyPath) => {
          expect(rmSyncSpy).toHaveBeenCalledWith(keyPath, { force: true });
        });
        expect(process.env['db-bigquery-first']).toBeUndefined();
        expect(process.env['db-bigquery-second']).toBeUndefined();
        expect(process.env['db-bigquery-email-first']).toBeUndefined();
        expect(process.env['db-bigquery-email-second']).toBeUndefined();
      } finally {
        ConnectorsService.cleanupBigQueryKeyFiles();
        writeFileSpy.mockRestore();
        rmSyncSpy.mockRestore();
      }
    });
  });

  describe('Fabric Rosetta boundary', () => {
    it('refuses to fabricate a JDBC URL for Fabric', async () => {
      await expect(
        ConnectorsService.generateJdbcUrl({ type: 'fabricspark' } as any),
      ).rejects.toThrow(
        'CONNECTION_FEATURE_NOT_IMPLEMENTED: Microsoft Fabric Lakehouse Rosetta JDBC URL generation is not implemented yet.',
      );
    });
  });

  describe('Fabric Spark SQL statement policy', () => {
    const hasMultipleStatements = (query: string) =>
      (ConnectorsService as any).hasMultipleSqlStatements(query);

    it('allows one statement with trailing semicolons and quoted semicolons', () => {
      expect(hasMultipleStatements("SELECT ';' AS value;")).toBe(false);
      expect(hasMultipleStatements('SELECT 1;;; -- trailing comment')).toBe(
        false,
      );
    });

    it('rejects multiple executable statements', () => {
      expect(hasMultipleStatements('SELECT 1; DROP TABLE dbo.orders')).toBe(
        true,
      );
      expect(hasMultipleStatements('SELECT 1; /* separator */ SELECT 2;')).toBe(
        true,
      );
    });
  });
});
