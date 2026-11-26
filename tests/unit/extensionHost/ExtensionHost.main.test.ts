import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { app, ipcMain, BrowserWindow } from 'electron';
import { ExtensionHostMain } from '../../../src/extensionHost/main/ExtensionHost.main';
import type {
  ExtensionMainApi,
  ExtensionMainModule,
} from '../../../src/extensionApi/main';
import { getScreenAgent } from '../../../src/main/services/ai/agents/screenAgents';

const manifest = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  publisher: 'acme',
  version: '1.0.0',
  engines: { rosettaStudio: '*' },
  main: 'main.js',
  ...extra,
});

const stateOf = (host: ExtensionHostMain, id: string) =>
  host.list().find((extension) => extension.id === id);

let userData: string;
let sent: Array<{ channel: string; payload: any }>;

beforeEach(() => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-ext-'));
  (app.getPath as jest.Mock).mockReturnValue(userData);
  (ipcMain.handle as jest.Mock).mockClear();
  (ipcMain.removeHandler as jest.Mock).mockClear();
  sent = [];
  (BrowserWindow as any).getAllWindows = () => [
    {
      isDestroyed: () => false,
      webContents: {
        send: (channel: string, payload: unknown) =>
          sent.push({ channel, payload }),
      },
    },
  ];
});

afterEach(() => {
  fs.removeSync(userData);
  delete (BrowserWindow as any).getAllWindows;
});

const newHost = () => new ExtensionHostMain({ studioVersion: '1.7.8' });

describe('main extension host', () => {
  it('activates internal extensions after the ones they depend on', async () => {
    const order: string[] = [];
    const host = newHost();
    host.registerBuiltin(
      manifest('dbt', { extensionDependencies: ['acme.sql'] }),
      {
        activate: (api) => {
          order.push('dbt');
          return { sqlSays: api.extensions.getExports('acme.sql') };
        },
      },
    );
    host.registerBuiltin(manifest('sql'), {
      activate: () => {
        order.push('sql');
        return 'hello from sql';
      },
    });

    await host.start();

    expect(order).toEqual(['sql', 'dbt']);
    expect(host.getExports('acme.dbt')).toEqual({ sqlSays: 'hello from sql' });
    expect(stateOf(host, 'acme.dbt')?.state).toBe('active');
  });

  it('keeps the rest running when one extension fails to start', async () => {
    const host = newHost();
    host.registerBuiltin(manifest('broken'), {
      activate: (api) => {
        api.ipc.handle('broken:ping', () => 'pong');
        throw new Error('boom');
      },
    });
    host.registerBuiltin(
      manifest('needs-broken', { extensionDependencies: ['acme.broken'] }),
      { activate: jest.fn() },
    );
    const fine: ExtensionMainModule = { activate: jest.fn() };
    host.registerBuiltin(manifest('fine'), fine);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await host.start();

    expect(stateOf(host, 'acme.broken')).toMatchObject({
      state: 'failed',
      error: 'boom',
    });
    // What it registered before failing is taken back.
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('broken:ping');
    expect(stateOf(host, 'acme.needs-broken')?.state).toBe('blocked');
    expect(stateOf(host, 'acme.fine')?.state).toBe('active');
    expect(fine.activate).toHaveBeenCalledTimes(1);
  });

  it('does not start an extension made for another Studio version', async () => {
    const host = newHost();
    const module = { activate: jest.fn() };
    host.registerBuiltin(
      manifest('future', { engines: { rosettaStudio: '>=2.0.0' } }),
      module,
    );

    await host.start();

    expect(module.activate).not.toHaveBeenCalled();
    expect(stateOf(host, 'acme.future')).toMatchObject({ state: 'blocked' });
  });

  it('removes everything an extension registered when it is switched off, and its dependants', async () => {
    const deactivate = jest.fn();
    const disposed = jest.fn();
    const host = newHost();
    host.registerBuiltin(manifest('sql'), {
      activate: (api) => {
        api.ipc.handle('sql:run', () => 1);
        api.subscriptions.push({ dispose: disposed });
      },
      deactivate,
    });
    const dbt = { activate: jest.fn(), deactivate: jest.fn() };
    host.registerBuiltin(
      manifest('dbt', { extensionDependencies: ['acme.sql'] }),
      dbt,
    );
    await host.start();

    await host.setEnabled('acme.sql', false);

    expect(deactivate).toHaveBeenCalledTimes(1);
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('sql:run');
    expect(dbt.deactivate).toHaveBeenCalledTimes(1);
    expect(stateOf(host, 'acme.sql')?.state).toBe('disabled');
    expect(stateOf(host, 'acme.dbt')?.state).toBe('blocked');
    // Every window is told.
    expect(
      sent.some((message) => message.channel === 'extensions:changed'),
    ).toBe(true);

    await host.setEnabled('acme.sql', true);

    expect(stateOf(host, 'acme.sql')?.state).toBe('active');
    expect(stateOf(host, 'acme.dbt')?.state).toBe('active');
    expect(dbt.activate).toHaveBeenCalledTimes(2);
  });

  it('remembers what was switched off for the next start', async () => {
    const first = newHost();
    first.registerBuiltin(manifest('sql'), { activate: jest.fn() });
    await first.start();
    await first.setEnabled('acme.sql', false);

    const module = { activate: jest.fn() };
    const second = newHost();
    second.registerBuiltin(manifest('sql'), module);
    await second.start();

    expect(module.activate).not.toHaveBeenCalled();
    expect(stateOf(second, 'acme.sql')).toMatchObject({
      enabled: false,
      state: 'disabled',
    });
  });

  it('waits for a restart when the extension says it cannot switch live', async () => {
    const module = { activate: jest.fn(), deactivate: jest.fn() };
    const host = newHost();
    host.registerBuiltin(manifest('heavy', { requiresRestart: true }), module);
    await host.start();

    await host.setEnabled('acme.heavy', false);

    expect(module.deactivate).not.toHaveBeenCalled();
    expect(stateOf(host, 'acme.heavy')).toMatchObject({
      enabled: false,
      state: 'active',
      restartPending: true,
    });
  });

  it('stops every extension on quit, last started first', async () => {
    const order: string[] = [];
    const host = newHost();
    host.registerBuiltin(manifest('sql'), {
      activate: jest.fn(),
      deactivate: () => {
        order.push('sql');
      },
    });
    host.registerBuiltin(
      manifest('dbt', { extensionDependencies: ['acme.sql'] }),
      {
        activate: jest.fn(),
        deactivate: () => {
          order.push('dbt');
        },
      },
    );
    await host.start();

    await host.deactivateAll();

    expect(order).toEqual(['dbt', 'sql']);
  });

  describe('installed extensions', () => {
    const writeExtension = (folder: string, name: string, body: string) => {
      fs.ensureDirSync(folder);
      fs.writeJsonSync(path.join(folder, 'package.json'), manifest(name));
      fs.writeFileSync(path.join(folder, 'main.js'), body);
    };

    it('installs from a folder, runs it, and uninstalls it', async () => {
      const source = path.join(userData, 'source', 'hello');
      writeExtension(
        source,
        'hello',
        "exports.activate = (api) => { api.ipc.handle('hello:ping', () => 'pong'); return { loaded: true }; };",
      );
      const host = newHost();
      await host.start();

      const id = await host.install(source);

      expect(id).toBe('acme.hello');
      const installedAt = path.join(userData, 'extensions', 'acme.hello');
      expect(fs.existsSync(path.join(installedAt, 'main.js'))).toBe(true);
      expect(stateOf(host, id)).toMatchObject({
        source: 'installed',
        state: 'active',
      });
      expect(host.getExports(id)).toEqual({ loaded: true });
      expect(ipcMain.handle).toHaveBeenCalledWith(
        'hello:ping',
        expect.any(Function),
      );

      await host.uninstall(id);

      expect(fs.existsSync(installedAt)).toBe(false);
      expect(stateOf(host, id)).toBeUndefined();
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('hello:ping');
    });

    it("gives an installed extension Studio's own backend pieces as api.studio", async () => {
      // An extension that is not compiled into Studio: plain CommonJS that
      // builds the AI agent of its screen from what `api` hands it, with no
      // import from Studio.
      const source = path.join(userData, 'source', 'agent');
      writeExtension(
        source,
        'agent',
        `exports.activate = (api) => {
          const { ToolLoopAgent, tool, composeAgentRuntime } = api.studio;
          api.agents.add('acme', (base, context) => {
            const tools = { acme_ping: tool({ description: 'ping' }) };
            const runtime = composeAgentRuntime(base, 'You are the Acme agent.', tools);
            return new ToolLoopAgent({ model: base.model, ...runtime, mode: context.toolMode });
          });
          return { pieces: Object.keys(api.studio).sort() };
        };`,
      );
      const host = newHost();
      // What the app gives the host at start-up (there: Studio's real pieces).
      class FakeToolLoopAgent {
        config: unknown;

        constructor(config: unknown) {
          this.config = config;
        }
      }
      host.setStudioApi(() => ({
        ToolLoopAgent: FakeToolLoopAgent,
        tool: (definition: unknown) => definition,
        composeAgentRuntime: (
          _base: unknown,
          instructions: string,
          tools: unknown,
        ) => ({ instructions, tools }),
      }));
      await host.start();

      const id = await host.install(source);

      expect(stateOf(host, id)).toMatchObject({ state: 'active' });
      expect(host.getExports(id)).toEqual({
        pieces: ['ToolLoopAgent', 'composeAgentRuntime', 'tool'],
      });
      const agent = await getScreenAgent('acme')?.(
        { model: 'the model' } as any,
        { toolMode: 'chat' } as any,
      );
      expect(agent).toBeInstanceOf(FakeToolLoopAgent);
      expect(agent.config).toEqual({
        model: 'the model',
        instructions: 'You are the Acme agent.',
        tools: { acme_ping: { description: 'ping' } },
        mode: 'chat',
      });

      await host.uninstall(id);
      expect(getScreenAgent('acme')).toBeUndefined();
    });

    it('finds extensions already in the folder at start', async () => {
      writeExtension(
        path.join(userData, 'extensions', 'acme.found'),
        'found',
        'exports.activate = () => 42;',
      );
      const host = newHost();

      await host.start();

      expect(host.getExports('acme.found')).toBe(42);
    });

    it('lists a folder without a usable manifest as failed and never runs it', async () => {
      const folder = path.join(userData, 'extensions', 'junk');
      fs.ensureDirSync(folder);
      fs.writeFileSync(path.join(folder, 'package.json'), '{ not json');
      const host = newHost();

      await host.start();

      expect(stateOf(host, 'junk')).toMatchObject({
        state: 'failed',
        enabled: false,
      });
    });

    it('refuses a package that is not an extension', async () => {
      const source = path.join(userData, 'source', 'plain');
      fs.ensureDirSync(source);
      fs.writeJsonSync(path.join(source, 'package.json'), { name: 'plain' });
      const host = newHost();
      await host.start();

      await expect(host.install(source)).rejects.toThrow(/publisher/);
      // Nothing is left behind in the extensions folder.
      expect(
        fs
          .readdirSync(path.join(userData, 'extensions'))
          .filter((name) => name.startsWith('.staging-')),
      ).toEqual([]);
    });

    it('serves only files inside the extension', async () => {
      const source = path.join(userData, 'source', 'hello');
      writeExtension(source, 'hello', 'exports.activate = () => undefined;');
      const host = newHost();
      await host.start();
      const id = await host.install(source);
      const root = path.join(userData, 'extensions', id);

      expect(host.resolveResource(id, 'main.js')).toBe(
        path.join(root, 'main.js'),
      );
      expect(host.resolveResource(id, '../state.json')).toBeNull();
      expect(host.resolveResource('acme.unknown', 'main.js')).toBeNull();
    });
  });

  describe('bridge', () => {
    const hostWithBridge = async () => {
      let api: ExtensionMainApi | undefined;
      const host = newHost();
      host.registerBuiltin(manifest('sql'), {
        activate: (context) => {
          api = context;
        },
      });
      await host.start();
      return { host, api: api! };
    };

    it('resolves with what the window answered', async () => {
      const { host, api } = await hostWithBridge();

      const answer = api.bridge.request('editor:read', { tab: 1 });
      const request = sent.find(
        (message) => message.channel === 'extensions:bridge:request',
      )!.payload;
      expect(request).toMatchObject({
        extensionId: 'acme.sql',
        operation: 'editor:read',
        payload: { tab: 1 },
      });
      host.resolveBridgeResponse({
        requestId: request.requestId,
        success: true,
        data: 'select 1',
      });

      await expect(answer).resolves.toBe('select 1');
    });

    it('rejects when the window reports an error or nobody answers', async () => {
      const { host, api } = await hostWithBridge();

      const failing = api.bridge.request('editor:read');
      const request = sent.find(
        (message) => message.channel === 'extensions:bridge:request',
      )!.payload;
      host.resolveBridgeResponse({
        requestId: request.requestId,
        success: false,
        error: 'no editor open',
      });
      await expect(failing).rejects.toThrow('no editor open');

      await expect(
        api.bridge.request('editor:read', undefined, { timeoutMs: 10 }),
      ).rejects.toThrow(/No window answered/);
    });
  });
});
