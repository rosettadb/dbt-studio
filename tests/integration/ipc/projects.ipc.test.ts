import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

// Import handlers after mocks
import registerProjectHandlers from '../../../src/main/ipcHandlers/projects.ipcHandlers';

// Define path constants
const TEST_DIR_NAME = 'dbt-studio-projects-ipc-test';
const TEST_DIR = path.join(os.tmpdir(), TEST_DIR_NAME);
const MOCK_USER_DATA = path.join(TEST_DIR, 'userData');

// Mock heavy database drivers to avoid native module issues
jest.mock('@databricks/sql', () => ({
  DBSQLClient: jest.fn(),
  DBSQLSession: jest.fn(),
}));

jest.mock('snowflake-sdk', () => ({
  createConnection: jest.fn(),
}));

jest.mock('@google-cloud/bigquery', () => ({
  BigQuery: jest.fn(),
}));

// Mock electron
jest.mock('electron', () => {
  const handlers = new Map<string, Function>();

  return {
    ipcMain: {
      handle: (channel: string, handler: Function) => {
        handlers.set(channel, handler);
      },
      invoke: async (channel: string, ...args: any[]) => {
        const handler = handlers.get(channel);
        if (!handler) throw new Error(`No handler for channel: ${channel}`);
        // eslint-disable-next-line
        return handler({ sender: {} }, ...args);
      },
      removeHandler: (channel: string) => {
        handlers.delete(channel);
      },
    },
    app: {
      getPath: jest.fn(() => {
        // eslint-disable-next-line global-require
        const tmp = require('os').tmpdir();
        // eslint-disable-next-line global-require
        const p = require('path');
        return p.join(tmp, 'dbt-studio-projects-ipc-test', 'userData');
      }),
      getName: jest.fn().mockReturnValue('Rosetta DBT Studio Test'),
      getVersion: jest.fn().mockReturnValue('1.0.0'),
    },
    dialog: {
      showOpenDialog: jest.fn(),
      showMessageBox: jest.fn().mockResolvedValue({ response: 1 }),
    },
  };
});

describe('Projects IPC Integration', () => {
  let mockIpc: any;

  beforeAll(async () => {
    // Create test directory structure
    if (!fs.existsSync(MOCK_USER_DATA)) {
      fs.mkdirSync(MOCK_USER_DATA, { recursive: true });
    }

    // eslint-disable-next-line
    mockIpc = require('electron').ipcMain;

    // Register handlers
    registerProjectHandlers();
  });

  afterAll(() => {
    // Cleanup
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('project:add', () => {
    it('should create a new project and return it', async () => {
      const projectPath = path.join(TEST_DIR, 'my-project');
      if (!fs.existsSync(projectPath)) {
        fs.mkdirSync(projectPath, { recursive: true });
      }

      // We must ensure 'dbt_sample' exists in DATA_DIR (MOCK_USER_DATA)
      const dbtSampleDir = path.join(MOCK_USER_DATA, 'dbt_sample');
      if (!fs.existsSync(dbtSampleDir)) {
        fs.mkdirSync(dbtSampleDir, { recursive: true });
        fs.writeFileSync(
          path.join(dbtSampleDir, 'dbt_project.yml'),
          'name: "my_dbt_project"\nversion: "1.0.0"',
        );
      }

      // Also main.conf
      const mainConfPath = path.join(MOCK_USER_DATA, 'main.conf');
      if (!fs.existsSync(mainConfPath)) {
        fs.writeFileSync(mainConfPath, 'content');
      }

      const result = await mockIpc.invoke('project:add', {
        name: projectPath, // Providing full path as 'name'
        connectionId: undefined,
        createTemplateFolders: true,
      });

      expect(result).toBeDefined();
      expect(result.path).toBe(projectPath);
      expect(result.name).toBe(path.basename(projectPath));
    });
  });

  describe('project:list', () => {
    it('should return an array', async () => {
      const projects = await mockIpc.invoke('project:list');
      expect(Array.isArray(projects)).toBe(true);
    });

    it('should have correct structure when projects exist', async () => {
      const projects = await mockIpc.invoke('project:list');
      expect(Array.isArray(projects)).toBe(true);
      // Ensure at least one project exists from previous test
      expect(projects.length).toBeGreaterThanOrEqual(1);
      expect(projects[0]).toHaveProperty('path');
      expect(projects[0]).toHaveProperty('id');
    });
  });

  describe('project:get', () => {
    let projectId: string;

    beforeEach(async () => {
      // Get or create a project for testing
      const projects = await mockIpc.invoke('project:list');
      if (projects.length > 0) {
        projectId = projects[0].id;
      } else {
        // Create a new project if none exist
        const projectPath = path.join(TEST_DIR, `test-project-${Date.now()}`);
        if (!fs.existsSync(projectPath)) {
          fs.mkdirSync(projectPath, { recursive: true });
        }

        const result = await mockIpc.invoke('project:add', {
          name: projectPath,
          connectionId: undefined,
          createTemplateFolders: true,
        });
        projectId = result.id;
      }
    });

    it('should retrieve a project by id', async () => {
      expect(projectId).toBeDefined();

      const project = await mockIpc.invoke('project:get', {
        id: projectId,
      });
      expect(project).toBeDefined();
      expect(project.id).toBe(projectId);
    });

    it('should have required properties', async () => {
      expect(projectId).toBeDefined();

      const project = await mockIpc.invoke('project:get', {
        id: projectId,
      });
      expect(project).toHaveProperty('id');
      expect(project).toHaveProperty('path');
      expect(project).toHaveProperty('name');
    });
  });
});
