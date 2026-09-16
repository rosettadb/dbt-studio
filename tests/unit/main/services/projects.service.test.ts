jest.mock('openai', () => ({
  OpenAI: jest.fn(),
}));

jest.mock('../../../../src/main/utils/fileHelper', () => ({
  createNewFile: jest.fn(),
  createNewFolder: jest.fn(),
  copyPath: jest.fn(),
  createZipArchive: jest.fn(),
  deleteDirectory: jest.fn(),
  deleteItem: jest.fn(),
  getDirectoryStructure: jest.fn(),
  readFileContent: jest.fn(),
  saveFileContent: jest.fn(),
}));

jest.mock('../../../../src/main/database', () => ({
  __esModule: true,
  default: {
    getField: jest.fn(),
    updateField: jest.fn(),
    transaction: jest.fn(),
    getSnapshot: jest.fn(),
  },
}));

jest.mock('../../../../src/main/services/settings.service', () => ({
  __esModule: true,
  default: {
    loadSettings: jest.fn().mockResolvedValue({}),
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

const loadConfigurations = jest.fn();
const parseProjectConnectionFiles = jest.fn();

jest.mock('../../../../src/main/services/connectors.service', () => ({
  __esModule: true,
  default: {
    loadConfigurations: (...args: any[]) => loadConfigurations(...args),
    parseProjectConnectionFiles: (...args: any[]) =>
      parseProjectConnectionFiles(...args),
  },
}));

jest.mock('../../../../src/main/extractor', () => ({
  BigQueryExtractor: jest.fn(),
  DatabricksExtractor: jest.fn(),
  DuckDBExtractor: jest.fn(),
  PGSchemaExtractor: jest.fn(),
  RedshiftExtractor: jest.fn(),
  SnowflakeExtractor: jest.fn(),
}));

import ProjectsService from '../../../../src/main/services/projects.service';
import databaseStore from '../../../../src/main/database';

const mockedGetSnapshot = databaseStore.getSnapshot as jest.Mock;
const mockedTransaction = databaseStore.transaction as jest.Mock;

describe('ProjectsService (main)', () => {
  // Lightweight fake backing store: getSnapshot reads it, transaction
  // mutates it in place — mirrors DatabaseStore's contract closely enough
  // for these tests, which care about persisted state, not the storage
  // mechanism.
  let fakeDb: { connections: unknown[]; projects: unknown[] };

  beforeEach(() => {
    jest.clearAllMocks();
    fakeDb = { connections: [], projects: [] };
    mockedGetSnapshot.mockImplementation(() => Promise.resolve(fakeDb));
    mockedTransaction.mockImplementation(
      (mutator: (db: typeof fakeDb) => { db: typeof fakeDb; result: unknown }) => {
        const { db, result } = mutator(fakeDb);
        fakeDb = db;
        return Promise.resolve(result);
      },
    );
  });

  describe('loadProjects', () => {
    it('maps connection config onto projects', async () => {
      fakeDb = {
        connections: [
          {
            id: 'c1',
            connection: { type: 'postgres', name: 'db1' },
          },
        ],
        projects: [
          {
            id: 'p1',
            name: 'proj',
            path: '/tmp/proj',
            connectionId: 'c1',
            createdAt: '2020-01-01',
            isExtracted: false,
          },
        ],
      };

      const result = await ProjectsService.loadProjects();
      expect(result).toHaveLength(1);
      expect(result[0].connection).toEqual({ type: 'postgres', name: 'db1' });
    });
  });

  describe('getProject', () => {
    it('updates lastOpenedAt and returns configured project when ConnectorsService.loadConfigurations succeeds', async () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(123);

      fakeDb = {
        connections: [],
        projects: [
          {
            id: 'p1',
            name: 'proj',
            path: '/tmp/proj',
            createdAt: '2020-01-01',
            isExtracted: false,
          },
        ],
      };

      parseProjectConnectionFiles.mockResolvedValue({
        rosettaConnection: { dialect: 'duckdb' },
        dbtConnection: { type: 'duckdb' },
      });

      const result = await ProjectsService.getProject('p1');

      expect(fakeDb.projects).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'p1', lastOpenedAt: 123 }),
        ]),
      );
      expect(parseProjectConnectionFiles).toHaveBeenCalledWith('/tmp/proj');
      expect(result).toEqual(
        expect.objectContaining({
          id: 'p1',
          rosettaConnection: { dialect: 'duckdb' },
          dbtConnection: { type: 'duckdb' },
        }),
      );

      nowSpy.mockRestore();
    });

    it('falls back to raw project when ConnectorsService.loadConfigurations throws', async () => {
      fakeDb = {
        connections: [],
        projects: [
          {
            id: 'p1',
            name: 'proj',
            path: '/tmp/proj',
            createdAt: '2020-01-01',
            isExtracted: false,
          },
        ],
      };

      parseProjectConnectionFiles.mockImplementation(async () => {
        throw new Error('Missing connection');
      });

      const result = await ProjectsService.getProject('p1');
      expect(result).toEqual(expect.objectContaining({ id: 'p1' }));
    });
  });
});
