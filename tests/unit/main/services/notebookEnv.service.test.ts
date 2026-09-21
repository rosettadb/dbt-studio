/**
 * Unit tests for NotebookEnvService path resolution and input validation.
 * Nothing here spawns a process.
 */

import path from 'path';

jest.mock('../../../../src/main/utils/rendererBroadcast', () => ({
  broadcastToRenderers: jest.fn(),
}));

jest.mock('../../../../src/main/services/pythonRuntimes.service', () => ({
  __esModule: true,
  default: { requireBinary: jest.fn() },
}));

describe('NotebookEnvService', () => {
  const load = async () =>
    (await import('../../../../src/main/services/notebookEnv.service')).default;

  it('roots every venv under userData/notebook-venvs/<notebookId>', async () => {
    const NotebookEnvService = await load();
    expect(NotebookEnvService.getVenvDir('abc-123')).toBe(
      '/mock/app/path/notebook-venvs/abc-123',
    );
    expect(NotebookEnvService.getWorkDir('abc-123')).toBe(
      '/mock/app/path/notebook-venvs/abc-123/workspace',
    );
  });

  it('never resolves into the studio global venv', async () => {
    const NotebookEnvService = await load();
    expect(NotebookEnvService.getVenvDir('nb')).not.toContain('/venv/');
    expect(NotebookEnvService.getVenvsRoot()).not.toBe('/mock/app/path/venv');
  });

  it('rejects notebook ids that could escape the venv root', async () => {
    const NotebookEnvService = await load();
    expect(() => NotebookEnvService.getVenvDir('../etc')).toThrow(
      /Invalid notebook id/,
    );
    expect(() => NotebookEnvService.getVenvDir('a/b')).toThrow(
      /Invalid notebook id/,
    );
  });

  it('resolves the venv interpreter per platform', async () => {
    const NotebookEnvService = await load();
    const python = NotebookEnvService.resolveVenvPython('/x/venv');
    const expected =
      process.platform === 'win32'
        ? path.join('/x/venv', 'Scripts', 'python.exe')
        : '/x/venv/bin/python3';
    expect(python).toBe(expected);
  });

  it('strips ANSI and progress-bar noise from forwarded pip output', async () => {
    const { stripControlSequences } = await import(
      '../../../../src/main/services/notebookEnv.service'
    );
    const raw =
      '\u001b[2K\u001b[38;2;249;38;114m━━━━━━━━\u001b[0m 1.2/3.4 MB \u001b[31m1.0 MB/s\u001b[0m';
    expect(stripControlSequences(raw).trim()).toBe('1.2/3.4 MB 1.0 MB/s');
    expect(stripControlSequences('Collecting pyspark')).toBe(
      'Collecting pyspark',
    );
  });

  it('rejects package specifiers that look like pip flags or paths', async () => {
    const NotebookEnvService = await load();
    await expect(
      NotebookEnvService.installPackages('nb', ['--index-url=evil']),
    ).rejects.toThrow(/Invalid package specifier/);
    await expect(
      NotebookEnvService.installPackages('nb', ['../local']),
    ).rejects.toThrow(/Invalid package specifier/);
    await expect(NotebookEnvService.installPackages('nb', [])).rejects.toThrow(
      /No packages/,
    );
  });

  it('refuses to uninstall the packages the kernel depends on', async () => {
    const NotebookEnvService = await load();
    await expect(
      NotebookEnvService.uninstallPackage('nb', 'ipykernel'),
    ).rejects.toThrow(/required by the notebook kernel/);
    await expect(
      NotebookEnvService.uninstallPackage('nb', 'pip'),
    ).rejects.toThrow(/required by the notebook kernel/);
    await expect(
      NotebookEnvService.uninstallPackage('nb', 'bad name'),
    ).rejects.toThrow(/Invalid package name/);
  });
});
