jest.mock('openai', () => ({
  OpenAI: jest.fn(),
}));

const loadDatabaseFile = jest.fn();
const updateDatabase = jest.fn();

jest.mock('../../../../src/main/utils/fileHelper', () => ({
  loadDatabaseFile: (...args: any[]) => loadDatabaseFile(...args),
  updateDatabase: (...args: any[]) => updateDatabase(...args),
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

jest.mock('../../../../src/main/services/connectors.service', () => ({
  __esModule: true,
  default: {
    loadConfigurations: (...args: any[]) => loadConfigurations(...args),
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

describe('ProjectsService (main)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadProjects', () => {
    it('maps connection config onto projects', async () => {
      loadDatabaseFile.mockResolvedValue({
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
      });

      const result = await ProjectsService.loadProjects();
      expect(result).toHaveLength(1);
      expect(result[0].connection).toEqual({ type: 'postgres', name: 'db1' });
    });
  });

  describe('getProject', () => {
    it('updates lastOpenedAt and returns configured project when ConnectorsService.loadConfigurations succeeds', async () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(123);

      loadDatabaseFile.mockResolvedValue({
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
      });

      loadConfigurations.mockResolvedValue({ id: 'p1', configured: true });

      const result = await ProjectsService.getProject('p1');

      expect(updateDatabase).toHaveBeenCalledWith(
        'projects',
        expect.arrayContaining([
          expect.objectContaining({ id: 'p1', lastOpenedAt: 123 }),
        ]),
      );
      expect(loadConfigurations).toHaveBeenCalledWith('p1');
      expect(result).toEqual({ id: 'p1', configured: true });

      nowSpy.mockRestore();
    });

    it('falls back to raw project when ConnectorsService.loadConfigurations throws', async () => {
      loadDatabaseFile.mockResolvedValue({
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
      });

      loadConfigurations.mockImplementation(async () => {
        throw new Error('Missing connection');
      });

      const result = await ProjectsService.getProject('p1');
      expect(result).toEqual(expect.objectContaining({ id: 'p1' }));
    });
  });
});
