import React from 'react';
import { ExtensionHostRenderer } from '../../../src/extensionHost/renderer/ExtensionHost.renderer';
import {
  dashboardCards,
  navigationItems,
  screens,
  slotRegistry,
} from '../../../src/extensionHost/renderer/contributions.renderer';
import { loadExtensionModule } from '../../../src/extensionHost/renderer/moduleLoader.renderer';
import {
  registerSharedModule,
  STUDIO_API_MODULE,
} from '../../../src/extensionHost/renderer/sharedModules.renderer';
import { listFileViews } from '../../../src/renderer/components/fileViews/registry';
import { listTerminalPanels } from '../../../src/renderer/components/terminal/panels/registry';
import { getCommands } from '../../../src/renderer/components/commandPalette/commands';
import type {
  ExtensionRendererApi,
  ExtensionRendererModule,
} from '../../../src/extensionApi/renderer';
import type {
  ExtensionDescription,
  ExtensionState,
} from '../../../src/extensionHost/shared/manifest.shared';

const Noop: React.FC = () => null;

const describeExtension = (
  name: string,
  state: ExtensionState = 'active',
  extra: Partial<ExtensionDescription['manifest']> = {},
  source: ExtensionDescription['source'] = 'builtin',
): ExtensionDescription => ({
  id: `acme.${name}`,
  manifest: {
    name,
    publisher: 'acme',
    version: '1.0.0',
    engines: { rosettaStudio: '*' },
    renderer: 'renderer.js',
    ...extra,
  },
  source,
  enabled: state !== 'disabled',
  state,
});

const ipc = () => (window as any).electron.ipcRenderer;

// Everything one extension can add, so removal can be checked in one place.
const contributeEverything = (api: ExtensionRendererApi) => {
  api.navigation.addItem({
    id: 'hello',
    path: '/app/hello',
    label: 'Hello',
    description: 'Says hello',
    icon: Noop,
  });
  api.screens.add({ id: 'hello', paths: ['hello'], Component: Noop });
  api.slots.add('test.slot', { id: 'hello', Component: Noop });
  api.dashboard.addCard({
    id: 'hello',
    title: 'Hello',
    category: 'Test',
    description: 'Says hello',
    icon: Noop,
  });
  api.fileViews.add({
    id: 'hello',
    matches: (tab) => tab.path.endsWith('.hello'),
    Component: Noop,
  });
  api.panels.add({
    id: 'hello',
    label: 'HELLO',
    useState: () => ({ visible: true }),
    Component: Noop,
  });
  api.commands.add({ id: 'hello.say', label: 'Say hello', run: jest.fn() });
};

const has = (list: ReadonlyArray<{ id: string }>, id: string) =>
  list.some((item) => item.id === id);

const contributionsPresent = () => ({
  navigation: has(navigationItems.list(), 'hello'),
  screen: has(screens.list(), 'hello'),
  slot: has(slotRegistry('test.slot').list(), 'hello'),
  card: has(dashboardCards.list(), 'hello'),
  fileView: has(listFileViews(), 'hello'),
  panel: has(listTerminalPanels(), 'hello'),
  command: has(getCommands(), 'hello.say'),
});

const allPresent = {
  navigation: true,
  screen: true,
  slot: true,
  card: true,
  fileView: true,
  panel: true,
  command: true,
};
const nonePresent = {
  navigation: false,
  screen: false,
  slot: false,
  card: false,
  fileView: false,
  panel: false,
  command: false,
};

beforeEach(() => {
  ipc().invoke.mockReset();
  ipc().on.mockReset();
  window.localStorage.clear();
});

describe('renderer extension host', () => {
  it('activates what the main host reports active and adds its contributions', async () => {
    const host = new ExtensionHostRenderer();
    host.registerBuiltin(
      { publisher: 'acme', name: 'hello' },
      { activate: contributeEverything },
    );
    ipc().invoke.mockResolvedValue([describeExtension('hello')]);

    await host.start();

    expect(contributionsPresent()).toEqual(allPresent);
    expect(host.getSnapshot()).toMatchObject([
      { id: 'acme.hello', uiActive: true },
    ]);

    await host.apply([describeExtension('hello', 'disabled')]);
  });

  it('removes everything an extension added when it stops being active', async () => {
    const deactivate = jest.fn();
    const host = new ExtensionHostRenderer();
    host.registerBuiltin(
      { publisher: 'acme', name: 'hello' },
      { activate: contributeEverything, deactivate },
    );
    await host.apply([describeExtension('hello')]);
    expect(contributionsPresent()).toEqual(allPresent);

    await host.apply([describeExtension('hello', 'disabled')]);

    expect(contributionsPresent()).toEqual(nonePresent);
    expect(deactivate).toHaveBeenCalledTimes(1);
    expect(host.getSnapshot()).toMatchObject([
      { id: 'acme.hello', uiActive: false },
    ]);
  });

  it('does not activate an extension the main host did not start', async () => {
    const module = { activate: jest.fn() };
    const host = new ExtensionHostRenderer();
    host.registerBuiltin({ publisher: 'acme', name: 'hello' }, module);

    await host.apply([describeExtension('hello', 'blocked')]);

    expect(module.activate).not.toHaveBeenCalled();
  });

  it('keeps the rest running when one extension fails, and takes back what it added', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const host = new ExtensionHostRenderer();
    host.registerBuiltin(
      { publisher: 'acme', name: 'hello' },
      {
        activate: (api) => {
          contributeEverything(api);
          throw new Error('boom');
        },
      },
    );
    const fine = { activate: jest.fn(() => 'fine exports') };
    host.registerBuiltin({ publisher: 'acme', name: 'fine' }, fine);
    const dependant = { activate: jest.fn() };
    host.registerBuiltin({ publisher: 'acme', name: 'dependant' }, dependant);

    await host.apply([
      describeExtension('hello'),
      describeExtension('fine'),
      describeExtension('dependant', 'active', {
        extensionDependencies: ['acme.hello'],
      }),
    ]);

    expect(contributionsPresent()).toEqual(nonePresent);
    expect(host.getExports('acme.fine')).toBe('fine exports');
    expect(dependant.activate).not.toHaveBeenCalled();
    expect(host.getSnapshot()).toMatchObject([
      { id: 'acme.hello', uiActive: false, uiError: 'boom' },
      { id: 'acme.fine', uiActive: true },
      { id: 'acme.dependant', uiActive: false },
    ]);
  });

  it('gives dependants what the extension they depend on returned', async () => {
    let seen: unknown;
    const host = new ExtensionHostRenderer();
    host.registerBuiltin(
      { publisher: 'acme', name: 'sql' },
      { activate: () => ({ Editor: Noop }) },
    );
    host.registerBuiltin(
      { publisher: 'acme', name: 'dbt' },
      {
        activate: (api) => {
          seen = api.extensions.getExports('acme.sql');
        },
      },
    );

    await host.apply([
      describeExtension('sql'),
      describeExtension('dbt', 'active', {
        extensionDependencies: ['acme.sql'],
      }),
    ]);

    expect(seen).toEqual({ Editor: Noop });
  });

  it('answers a bridge request from the main half with the registered handler', async () => {
    const host = new ExtensionHostRenderer();
    host.registerBuiltin(
      { publisher: 'acme', name: 'sql' },
      {
        activate: (api) => {
          api.bridge.handle('editor:read', (payload) => `text of ${payload}`);
        },
      },
    );
    ipc().invoke.mockResolvedValue([describeExtension('sql')]);
    await host.start();
    const onBridgeRequest = ipc().on.mock.calls.find(
      ([channel]: [string]) => channel === 'extensions:bridge:request',
    )[1];
    ipc().invoke.mockClear();

    await onBridgeRequest({
      requestId: 'r1',
      extensionId: 'acme.sql',
      operation: 'editor:read',
      payload: 'tab 1',
    });

    expect(ipc().invoke).toHaveBeenCalledWith('extensions:bridge:response', {
      requestId: 'r1',
      success: true,
      data: 'text of tab 1',
    });
  });

  it('keeps storage private to the extension', async () => {
    let api: ExtensionRendererApi | undefined;
    const host = new ExtensionHostRenderer();
    host.registerBuiltin(
      { publisher: 'acme', name: 'sql' },
      {
        activate: (context) => {
          api = context;
        },
      },
    );
    await host.apply([describeExtension('sql')]);

    api!.storage.set('width', 320);

    expect(api!.storage.get('width')).toBe(320);
    expect(window.localStorage.getItem('extension:acme.sql:width')).toBe('320');
    api!.storage.remove('width');
    expect(api!.storage.get('width')).toBeUndefined();
  });
});

describe('loading the UI half of an installed extension', () => {
  const installed = describeExtension('remote', 'active', {}, 'installed');

  // jsdom does not fetch scripts, so the test plays the part of the script:
  // it calls define() as the running script and then fires its load event.
  const runScript = (define: () => void) => {
    const script = document.head.querySelector(
      'script[data-extension-id="acme.remote"]',
    ) as HTMLScriptElement;
    Object.defineProperty(document, 'currentScript', {
      value: script,
      configurable: true,
    });
    define();
    Object.defineProperty(document, 'currentScript', {
      value: null,
      configurable: true,
    });
    script.onload?.(new Event('load'));
    return script;
  };

  afterEach(() => {
    document.head
      .querySelectorAll('script[data-extension-id]')
      .forEach((script) => script.remove());
  });

  it('loads the script from the extension and hands it Studio’s own libraries', async () => {
    // The app registers its API module at start-up; here a stand-in.
    registerSharedModule(STUDIO_API_MODULE, () => ({ Slot: Noop }));
    const loading = loadExtensionModule(installed);
    let receivedReact: any;

    const script = runScript(() =>
      window.rosettaStudio!.define(
        'acme.remote',
        ['react', '@rosetta/studio-api'],
        (react: any, api: any) => {
          receivedReact = react;
          return { activate: () => typeof api.Slot };
        },
      ),
    );
    const module: ExtensionRendererModule = await loading;

    expect(script.src).toBe('rosetta-ext://acme.remote/renderer.js?v=1.0.0');
    // The very same React the app runs on, not a second copy.
    expect(receivedReact.useState).toBe(React.useState);
    expect(module.activate({} as ExtensionRendererApi)).toBe('function');
  });

  it('fails clearly when the extension needs a library Studio does not share', async () => {
    const loading = loadExtensionModule(installed);

    runScript(() =>
      window.rosettaStudio!.define(['lodash'], () => ({ activate: jest.fn() })),
    );

    await expect(loading).rejects.toThrow(/needs "lodash"/);
  });

  it('fails clearly when the script defines nothing', async () => {
    const loading = loadExtensionModule(installed);

    runScript(() => undefined);

    await expect(loading).rejects.toThrow(/did not call rosettaStudio.define/);
  });
});
