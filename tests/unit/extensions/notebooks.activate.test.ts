import { ipcMain } from 'electron';
import { ExtensionHostRenderer } from '../../../src/extensionHost/renderer/ExtensionHost.renderer';
import { ExtensionHostMain } from '../../../src/extensionHost/main/ExtensionHost.main';
import {
  dashboardCards,
  navigationItems,
  screens,
} from '../../../src/extensionHost/renderer/contributions.renderer';
import { parseExtensionManifest } from '../../../src/extensionHost/shared/manifest.shared';
import { notebooksManifest } from '../../../src/extensions/notebooks/manifest.shared';
import { notebooksRenderer } from '../../../src/extensions/notebooks/renderer';
import { notebooksMain } from '../../../src/extensions/notebooks/main';

const mockShutdownAll = jest.fn(async () => undefined);

// ESM-only packages somewhere below Studio's components; not under test.
jest.mock('react-markdown', () => ({ __esModule: true, default: () => null }));
jest.mock('remark-gfm', () => () => undefined);
jest.mock('rehype-raw', () => () => undefined);
jest.mock('rehype-highlight', () => () => undefined);
jest.mock('rehype-sanitize', () => () => undefined);
// The assistant pane has its own tests and does not load under jest as is.
jest.mock('../../../src/renderer/components/chat', () => ({
  ChatWindow: () => null,
}));
// The notebook stores, environments and kernels are Studio services with
// their own tests; here only the channels and the shutdown matter.
jest.mock('../../../src/main/services/notebooks.service', () => ({
  NotebooksService: {},
}));
jest.mock('../../../src/main/services/pythonNotebooks.service', () => ({
  __esModule: true,
  default: {},
}));
jest.mock('../../../src/main/services/notebookEnv.service', () => ({
  __esModule: true,
  default: {},
}));
jest.mock('../../../src/main/services/notebookKernel.service', () => ({
  __esModule: true,
  default: { shutdownAll: () => mockShutdownAll() },
}));
jest.mock('../../../src/main/services/pythonRuntimes.service', () => ({
  __esModule: true,
  default: {},
}));

const description = (state: 'active' | 'disabled') => {
  const parsed = parseExtensionManifest(notebooksManifest);
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  return {
    id: 'rosetta.notebooks',
    manifest: parsed.manifest,
    source: 'builtin' as const,
    enabled: state === 'active',
    state,
  };
};

describe('Notebooks extension', () => {
  it('has a valid manifest', () => {
    expect(parseExtensionManifest(notebooksManifest)).toMatchObject({
      ok: true,
    });
  });

  it('adds its sidebar entry, screen and Home card, and takes them back', async () => {
    const host = new ExtensionHostRenderer();
    host.registerBuiltin(notebooksManifest, notebooksRenderer);

    await host.apply([description('active')]);

    expect(navigationItems.get('notebooks')).toMatchObject({
      path: '/app/notebooks',
      label: 'Notebooks',
      testId: 'nav-item-notebooks',
      // Fourth: after the SQL Editor (300), before Object Explorer (500)
      order: 400,
    });
    expect(screens.get('notebooks')).toMatchObject({
      paths: ['notebooks'],
      // The top bar shows the AI assistant button on this screen
      assistant: true,
    });
    expect(dashboardCards.get('notebook')).toMatchObject({
      title: 'Notebook',
      category: 'Analytics',
      path: '/app/notebooks',
      // Second: after Projects (100), before the SQL Editor (300)
      order: 200,
    });

    await host.apply([description('disabled')]);

    expect(navigationItems.get('notebooks')).toBeUndefined();
    expect(screens.get('notebooks')).toBeUndefined();
    expect(dashboardCards.get('notebook')).toBeUndefined();
  });

  it('answers the notebook channels from its main half and stops the kernels with it', async () => {
    (ipcMain.handle as jest.Mock).mockClear();
    const host = new ExtensionHostMain({ studioVersion: '1.7.8' });
    host.registerBuiltin(notebooksManifest, notebooksMain);

    await host.start();

    expect(host.list()).toMatchObject([
      { id: 'rosetta.notebooks', state: 'active' },
    ]);
    const channels = (ipcMain.handle as jest.Mock).mock.calls.map(
      ([channel]) => channel as string,
    );
    // 18 SQL notebook channels, 2 interpreter channels, 22 Python notebook ones
    expect(channels).toHaveLength(42);
    expect(channels.filter((c) => c.startsWith('notebooks:'))).toHaveLength(18);
    expect(channels.filter((c) => c.startsWith('pythonRuntimes:'))).toEqual([
      'pythonRuntimes:list',
      'pythonRuntimes:install',
    ]);
    expect(
      channels.filter((c) => c.startsWith('pythonNotebooks:')),
    ).toHaveLength(22);

    expect(mockShutdownAll).not.toHaveBeenCalled();
    await host.deactivateAll();
    expect(mockShutdownAll).toHaveBeenCalledTimes(1);
  });
});
