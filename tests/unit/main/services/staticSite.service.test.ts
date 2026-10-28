/**
 * StaticSiteService.build — a build with no pages must not wipe the files of
 * a previous build in the output folder (issue #544).
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

// ─── Mocks (must be declared before any imports) ─────────────────────────────

const mockListPages = jest.fn();

jest.mock('electron', () => ({
  app: { getAppPath: jest.fn(() => '/mock/app/path') },
  BrowserWindow: jest.fn(),
  shell: { openPath: jest.fn() },
  dialog: { showOpenDialog: jest.fn() },
}));

jest.mock('../../../../src/main/services/analyticsPages.service', () => ({
  AnalyticsPagesService: {
    list: (...args: any[]) => mockListPages(...args),
  },
}));

jest.mock('../../../../src/main/services/connectors.service', () => ({
  __esModule: true,
  default: {},
}));
jest.mock('../../../../src/main/services/mainDatabase.service', () => ({
  __esModule: true,
  default: {},
}));
jest.mock('../../../../src/main/services/settings.service', () => ({
  __esModule: true,
  default: {},
}));
jest.mock('../../../../src/main/services/duckLake.service', () => ({
  __esModule: true,
  default: {},
}));

// Read at module load by the service; not set outside a packaged Electron app
(process as any).resourcesPath = '/mock/resources';

// ─── Import after mocks ───────────────────────────────────────────────────────

// eslint-disable-next-line import/first
import { StaticSiteService } from '../../../../src/main/services/staticSite.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockMainWindow = { webContents: { send: jest.fn() } } as any;

let outputPath: string;

beforeEach(() => {
  jest.clearAllMocks();
  outputPath = fs.mkdtempSync(path.join(os.tmpdir(), 'static-site-test-'));
  fs.writeFileSync(path.join(outputPath, 'index.html'), '<html></html>');
  fs.mkdirSync(path.join(outputPath, 'assets'));
  fs.mkdirSync(path.join(outputPath, 'pages'));
});

afterEach(() => {
  fs.rmSync(outputPath, { recursive: true, force: true });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('StaticSiteService.build with no pages', () => {
  it('keeps the previous build files when overwriting', async () => {
    mockListPages.mockResolvedValue([]);

    const result = await StaticSiteService.build(mockMainWindow, {
      connectionId: 'conn-1',
      outputPath,
      overwrite: true,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('No analytics pages found for this connection.');
    expect(fs.existsSync(path.join(outputPath, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(outputPath, 'assets'))).toBe(true);
    expect(fs.existsSync(path.join(outputPath, 'pages'))).toBe(true);
  });
});
