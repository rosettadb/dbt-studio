import { ipcMain } from 'electron';
import { ExtensionHostRenderer } from '../../../src/extensionHost/renderer/ExtensionHost.renderer';
import { notebooksService } from '../../../src/extensions/notebooks/renderer/notebooks.service';
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
import { createNotebooksAgent } from '../../../src/extensions/notebooks/main/notebooksAgent';
import { getScreenAgent } from '../../../src/main/services/ai/agents/screenAgents';
import { emitWillDeleteConnection } from '../../../src/main/services/connectionEvents';
import { listNotebooksOfConnection } from '../../../src/main/services/notebookCatalog';

const mockShutdownAll = jest.fn(async () => undefined);
const mockArchive = jest.fn(async (..._args: unknown[]) => undefined);
const mockListNotebooks = jest.fn(async (..._args: unknown[]) => [
  { id: 'n1' },
]);

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
jest.mock('../../../src/extensions/notebooks/main/notebooks.service', () => ({
  NotebooksService: {
    archiveConnectionNotebooks: (...args: unknown[]) => mockArchive(...args),
    listNotebooks: (...args: unknown[]) => mockListNotebooks(...args),
  },
}));
jest.mock(
  '../../../src/extensions/notebooks/main/pythonNotebooks.service',
  () => ({
    __esModule: true,
    default: {},
  }),
);
jest.mock('../../../src/extensions/notebooks/main/notebookEnv.service', () => ({
  __esModule: true,
  default: {},
}));
jest.mock(
  '../../../src/extensions/notebooks/main/notebookKernel.service',
  () => ({
    __esModule: true,
    default: { shutdownAll: () => mockShutdownAll() },
  }),
);
jest.mock('../../../src/main/services/pythonRuntimes.service', () => ({
  __esModule: true,
  default: {},
}));

// The agent itself is built from the AI SDK; not under test here.
jest.mock('../../../src/extensions/notebooks/main/notebooksAgent', () => ({
  createNotebooksAgent: jest.fn(async () => 'the notebooks agent'),
}));
// Studio's agent runtime has its own tests; here only what the extension
// asks of it matters.
jest.mock('../../../src/main/services/agent.service', () => ({
  __esModule: true,
  default: {
    onFactoryReset: jest.fn(() => () => undefined),
    getAgentContext: jest.fn(),
  },
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

    // Its own code reaches the main process through `api.ipc`, bound when
    // the extension is activated.
    const invoke = jest
      .spyOn(window.electron.ipcRenderer, 'invoke')
      .mockResolvedValue([] as never);
    await notebooksService.listNotebooks('c1');
    expect(invoke).toHaveBeenCalledWith('notebooks:list', 'c1');
    invoke.mockRestore();

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
    // plus the 7 channels the open notebook answers the agent on
    expect(channels).toHaveLength(49);
    expect(channels.filter((c) => c.startsWith('notebooks:'))).toHaveLength(18);
    expect(channels.filter((c) => c.startsWith('pythonRuntimes:'))).toEqual([
      'pythonRuntimes:list',
      'pythonRuntimes:install',
    ]);
    expect(
      channels.filter((c) => c.startsWith('pythonNotebooks:')),
    ).toHaveLength(22);

    expect(channels.filter((c) => c.startsWith('agent:'))).toEqual([
      'agent:notebook:state-response',
      'agent:notebook:cell-read-response',
      'agent:notebook:cell-add-response',
      'agent:notebook:cell-update-response',
      'agent:notebook:cell-run-response',
      'agent:notebook:cell-result-response',
      'agent:python-notebook:response',
    ]);

    // The AI agent of the Notebooks screen
    const base: any = { model: 'm' };
    const context: any = {
      conversationId: 5,
      toolMode: 'agent',
      connectionMeta: { name: 'c', type: 'duckdb' },
      connectionId: 'c1',
      notebookId: 'nb1',
      enabledTools: {},
      disabledTools: ['writeFile'],
      skills: '',
    };
    await expect(getScreenAgent('notebooks')?.(base, context)).resolves.toBe(
      'the notebooks agent',
    );
    expect(createNotebooksAgent).toHaveBeenCalledWith(base, {
      connectionMeta: context.connectionMeta,
      notebookId: 'nb1',
      connectionId: 'c1',
      enabledTools: {},
      disabledTools: ['writeFile'],
      skills: '',
      conversationId: 5,
      toolMode: 'agent',
    });

    // Deleting a connection archives its notebooks first, and stops when
    // that fails
    await emitWillDeleteConnection('c1');
    expect(mockArchive).toHaveBeenCalledWith('c1');
    mockArchive.mockRejectedValueOnce(new Error('disk full'));
    await expect(emitWillDeleteConnection('ducklake-9')).rejects.toThrow(
      'disk full',
    );

    // Studio's second brain can list a connection's notebooks
    await expect(listNotebooksOfConnection('c1')).resolves.toEqual([
      { id: 'n1' },
    ]);

    expect(mockShutdownAll).not.toHaveBeenCalled();
    await host.deactivateAll();
    expect(mockShutdownAll).toHaveBeenCalledTimes(1);

    // With the extension stopped, Studio's links to it are gone
    expect(getScreenAgent('notebooks')).toBeUndefined();
    mockArchive.mockClear();
    await emitWillDeleteConnection('c2');
    expect(mockArchive).not.toHaveBeenCalled();
    await expect(listNotebooksOfConnection('c1')).resolves.toEqual([]);
  });
});
