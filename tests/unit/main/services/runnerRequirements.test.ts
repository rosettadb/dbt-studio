import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import RunnerService from '../../../../src/extensions/pipeline/main/runner.service';
import SettingsService from '../../../../src/main/services/settings.service';
import {
  loadPluginDefinitions,
  resolveProjectMacroDirs,
} from '../../../../src/main/services/pluginManifest.service';

jest.mock('../../../../src/main/services/settings.service', () => ({
  __esModule: true,
  default: { loadSettings: jest.fn(), saveSettings: jest.fn() },
}));

const loadSettings = SettingsService.loadSettings as jest.Mock;

// `node` runs these tests, so it is a tool that is certainly installed.
const requires = (id: string, check: object, install: object = {}) => ({
  id,
  label: id,
  check,
  install: { type: 'manual', url: 'https://example.com', ...install },
});

describe('runner plugin requirements', () => {
  let tempDir: string;
  let runnerHome: string;

  const writeManifest = (manifest: unknown) =>
    fs.outputJson(path.join(runnerHome, 'plugins.json'), manifest);

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'runner-requires-'));
    runnerHome = path.join(tempDir, 'plugins-home');
    loadSettings.mockResolvedValue({ runnerHome });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('has no plugins without a runner or with an unreadable manifest', async () => {
    expect(await loadPluginDefinitions()).toEqual([]);
    expect(await RunnerService.checkRequirements()).toEqual([]);

    await writeManifest({});
    expect(await loadPluginDefinitions()).toEqual([]);

    loadSettings.mockResolvedValue({});
    expect(await loadPluginDefinitions()).toEqual([]);
  });

  it('checks each tool the manifest lists', async () => {
    await writeManifest([
      {
        name: 'a@v1',
        script: 'a.sh',
        requires: [
          requires('with-version', { command: 'node', args: ['--version'] }),
          requires('too-old', {
            command: 'node',
            args: ['--version'],
            min_version: '9999',
          }),
          requires('present', { command: 'node' }),
          requires('missing', { command: 'no-such-tool-for-this-test' }),
          requires('missing-with-args', {
            command: 'no-such-tool-for-this-test',
            args: ['--version'],
          }),
        ],
      },
      {
        name: 'b@v1',
        script: 'b.sh',
        requires: [
          requires('with-version', { command: 'node', args: ['--version'] }),
        ],
      },
    ]);

    const statuses = await RunnerService.checkRequirements();
    const status = (id: string) => statuses.find((item) => item.id === id)!;

    expect(statuses).toHaveLength(5);
    expect(status('with-version')).toMatchObject({
      available: true,
      version: process.versions.node,
      plugins: ['a@v1', 'b@v1'],
    });
    // Found, but older than the manifest asks for.
    expect(status('too-old')).toMatchObject({
      available: false,
      version: process.versions.node,
    });
    expect(status('present').available).toBe(true);
    expect(status('present').path).toContain('node');
    expect(status('missing').available).toBe(false);
    expect(status('missing-with-args').available).toBe(false);
  }, 30000);

  it('uses what Studio installed itself for auto-installed tools', async () => {
    const pythonDir = path.join(tempDir, 'venv', 'bin');
    const managedTool =
      process.platform === 'win32' ? 'spark-tool.cmd' : 'spark-tool';
    await fs.outputFile(path.join(pythonDir, managedTool), '');
    loadSettings.mockResolvedValue({
      runnerHome,
      dbtPath: '/studio/venv/bin/dbt',
      dbtVersion: '1.9.0',
      pythonPath: path.join(pythonDir, 'python'),
    });
    await writeManifest([
      {
        name: 'a@v1',
        script: 'a.sh',
        requires: [
          requires(
            'dbt',
            { command: 'no-such-tool-for-this-test' },
            { type: 'auto', method: 'studio' },
          ),
          requires(
            'spark',
            { command: 'spark-tool', args: ['--version'] },
            { type: 'auto', method: 'pip', package: 'spark-tool' },
          ),
          // Not installed by Studio: falls back to the manifest's check.
          requires(
            'rosetta',
            { command: 'no-such-tool-for-this-test' },
            { type: 'auto', method: 'studio' },
          ),
        ],
      },
    ]);

    const statuses = await RunnerService.checkRequirements();
    expect(statuses[0]).toMatchObject({
      id: 'dbt',
      available: true,
      version: '1.9.0',
      path: '/studio/venv/bin/dbt',
      managedInStudio: true,
    });
    expect(statuses[1]).toMatchObject({
      id: 'spark',
      available: true,
      path: path.join(pythonDir, managedTool),
      managedInStudio: true,
    });
    expect(statuses[2]).toMatchObject({ id: 'rosetta', available: false });
  }, 30000);

  it('finds the dbt and Rosetta folders of a project for macros', async () => {
    const project = path.join(tempDir, 'project');
    await fs.ensureDir(project);
    expect(await resolveProjectMacroDirs(project)).toEqual({
      dbtDir: '',
      rosettaDir: '',
    });

    await fs.outputFile(path.join(project, 'transform', 'dbt_project.yml'), '');
    await fs.ensureDir(path.join(project, 'rosetta'));
    expect(await resolveProjectMacroDirs(project)).toEqual({
      dbtDir: 'transform',
      rosettaDir: 'rosetta',
    });

    // The project folder itself is the dbt project.
    await fs.outputFile(path.join(project, 'dbt_project.yml'), '');
    expect((await resolveProjectMacroDirs(project)).dbtDir).toBe('');
  });
});
