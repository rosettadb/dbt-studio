import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import {
  buildProjectChartsContext,
  createStudioChartsTools,
} from '../../../../../src/main/services/ai/tools/studio/charts.tools';
import { DbtChartsService } from '../../../../../src/main/services/dbtCharts.service';

jest.mock('../../../../../src/main/services/dbtCharts.service', () => ({
  DbtChartsService: {
    getStatus: jest.fn(),
    getProjectState: jest.fn(),
    validate: jest.fn(),
  },
}));

const service = DbtChartsService as unknown as {
  getStatus: jest.Mock;
  getProjectState: jest.Mock;
  validate: jest.Mock;
};

const projectState = (overrides: Record<string, unknown> = {}) => ({
  installed: true,
  adapter: 'postgres',
  support: { supported: true, extra: 'postgresql' },
  extraInstalled: true,
  manifestExists: true,
  hasChartsDir: true,
  hasConfig: false,
  ...overrides,
});

// AI SDK tools expose `execute(input, options)`.
const run = (toolDef: any, input: Record<string, unknown>) =>
  toolDef.execute(input, { toolCallId: 't', messages: [] });

describe('charts tools', () => {
  let dir: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dbt-charts-tools-'));
    await fs.outputFile(
      path.join(dir, 'charts', 'sales.yml'),
      'title: Sales\n',
    );
    await fs.outputFile(
      path.join(dir, 'charts', '_queries.yml'),
      'queries: {}\n',
    );
    await fs.writeFile(path.join(dir, 'dbt_project.yml'), "profile: 'shop'\n");
    service.getStatus.mockResolvedValue({
      installed: true,
      version: '0.11.1',
      pythonVersion: '3.12.10',
      extras: ['postgresql'],
    });
    service.getProjectState.mockResolvedValue(projectState());
  });

  afterEach(async () => {
    await fs.remove(dir);
  });

  describe('studio_charts_validate', () => {
    it.each(['models/x.yml', '../outside/charts/a.yml', 'dbt_charts.yml'])(
      'rejects %s',
      async (input) => {
        const tools = createStudioChartsTools(dir);
        const result = await run(tools.studio_charts_validate, { path: input });
        expect(result.ok).toBe(false);
        expect(service.validate).not.toHaveBeenCalled();
      },
    );

    it('tells the user to install when dbt Charts is missing', async () => {
      service.getStatus.mockResolvedValue({
        installed: false,
        version: null,
        pythonVersion: null,
        extras: [],
      });
      const tools = createStudioChartsTools(dir);
      const result = await run(tools.studio_charts_validate, {
        path: 'charts/sales.yml',
      });
      expect(result).toEqual({
        ok: false,
        error:
          'dbt Charts is not installed. Ask the user to click "Install dbt Charts" in any charts/ file.',
      });
    });

    it('returns counts and findings', async () => {
      service.validate.mockResolvedValue({
        diagnostics: [
          {
            severity: 'error',
            code: 'ERR-EXTRA-FIELD',
            message: 'Unknown key',
            fix: 'Remove it',
            file: 'charts/sales.yml',
            line: 3,
            column: 1,
          },
        ],
        errorCount: 1,
        warningCount: 0,
      });
      const tools = createStudioChartsTools(dir);
      const result = await run(tools.studio_charts_validate, {
        path: 'charts/sales.yml',
      });
      expect(service.validate).toHaveBeenCalledWith({
        projectPath: dir,
        filePath: path.join(dir, 'charts', 'sales.yml'),
      });
      expect(result).toEqual({
        ok: true,
        data: {
          path: 'charts/sales.yml',
          errorCount: 1,
          warningCount: 0,
          diagnostics: [
            {
              severity: 'error',
              code: 'ERR-EXTRA-FIELD',
              message: 'Unknown key',
              fix: 'Remove it',
              file: 'charts/sales.yml',
              line: 3,
            },
          ],
        },
      });
    });
  });

  describe('studio_charts_refresh_preview', () => {
    it('returns the refresh mutation for a board', async () => {
      const tools = createStudioChartsTools(dir);
      await expect(
        run(tools.studio_charts_refresh_preview, { path: 'charts/sales.yml' }),
      ).resolves.toEqual({
        ok: true,
        mutation: 'dbt-charts-preview-refresh',
        relativePath: 'charts/sales.yml',
      });
    });

    it('rejects a missing file and a path outside charts/', async () => {
      const tools = createStudioChartsTools(dir);
      const missing = await run(tools.studio_charts_refresh_preview, {
        path: 'charts/none.yml',
      });
      const outside = await run(tools.studio_charts_refresh_preview, {
        path: 'models/a.yml',
      });
      expect(missing.ok).toBe(false);
      expect(outside.ok).toBe(false);
    });
  });

  describe('buildProjectChartsContext', () => {
    it('is undefined with no charts/ folder and no install', async () => {
      service.getStatus.mockResolvedValue({
        installed: false,
        version: null,
        pythonVersion: null,
        extras: [],
      });
      service.getProjectState.mockResolvedValue(
        projectState({ hasChartsDir: false, installed: false }),
      );
      await expect(buildProjectChartsContext(dir)).resolves.toBeUndefined();
    });

    it('names the boards, the implicit source and the dialect', async () => {
      const context = await buildProjectChartsContext(dir);
      expect(context).toContain('installed 0.11.1');
      expect(context).toContain('charts/sales.yml');
      expect(context).toContain('charts/_queries.yml (partial)');
      expect(context).toContain('implicit dbt_profile source "shop"');
      expect(context).toContain('dbt adapter: postgres: write postgres SQL');
      expect(context).toContain('studio_charts_validate');
      // Guide is the 0.11.1 grammar: no main-only codes.
      expect(context).not.toContain('ERR-CHART-CHANNELS-INCOMPLETE');
      expect(context).not.toContain('funnel');
    });

    it('notes a missing manifest', async () => {
      service.getProjectState.mockResolvedValue(
        projectState({ manifestExists: false }),
      );
      const context = await buildProjectChartsContext(dir);
      expect(context).toContain('target/manifest.json: missing');
    });
  });
});
