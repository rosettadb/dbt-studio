import { ExtensionHostRenderer } from '../../../src/extensionHost/renderer/ExtensionHost.renderer';
import { createExtensionIpc } from '../../../src/extensionHost/renderer/extensionIpc.renderer';
import type { ExtensionDescription } from '../../../src/extensionHost/shared/manifest.shared';
import { ipc as sqlIpc } from '../../../src/extensions/sql/renderer/ipc';
import { ipc as analyticsIpc } from '../../../src/extensions/analytics/renderer/ipc';
import { ipc as notebooksIpc } from '../../../src/extensions/notebooks/renderer/ipc';
import { ipc as pipelineIpc } from '../../../src/extensions/pipeline/renderer/ipc';

// The UI code of an extension reaches the main process through `api.ipc`:
// its service files call `ipc.invoke` / `ipc.on` of the object the extension
// binds in `activate`. A listener added that way belongs to the extension
// and is removed with it.

const describeExtension = (
  state: ExtensionDescription['state'],
): ExtensionDescription => ({
  id: 'acme.talker',
  manifest: {
    name: 'talker',
    publisher: 'acme',
    version: '1.0.0',
    engines: { rosettaStudio: '*' },
    renderer: 'renderer.js',
  },
  source: 'builtin',
  enabled: state === 'active',
  state,
});

type Listener = (...args: unknown[]) => void;
let listeners: Array<{ channel: string; listener: Listener }>;
let invoke: jest.Mock;

beforeEach(() => {
  listeners = [];
  invoke = jest.fn(async (channel: string, ...args: unknown[]) => ({
    channel,
    args,
  }));
  (window as any).electron = {
    ipcRenderer: {
      invoke,
      on: (channel: string, listener: Listener) => {
        const entry = { channel, listener };
        listeners.push(entry);
        return () => {
          listeners = listeners.filter((existing) => existing !== entry);
        };
      },
    },
  };
});

afterEach(() => {
  delete (window as any).electron;
});

const startWith = async (ipc: ReturnType<typeof createExtensionIpc>) => {
  const host = new ExtensionHostRenderer();
  host.registerBuiltin(
    { publisher: 'acme', name: 'talker' },
    { activate: (api) => ipc.bind(api.ipc) },
  );
  await host.apply([describeExtension('active')]);
  return host;
};

describe("the IPC of an extension's UI code", () => {
  it('cannot be used before the extension is active', () => {
    const ipc = createExtensionIpc('Talker');
    expect(() => ipc.invoke('talker:hello')).toThrow(
      'Talker: the extension is not active',
    );
    expect(() => ipc.on('talker:event', jest.fn())).toThrow(
      'Talker: the extension is not active',
    );
  });

  it('calls the main process and gets its events once the extension is active', async () => {
    const ipc = createExtensionIpc('Talker');
    await startWith(ipc);

    await expect(ipc.invoke('talker:hello', 'a', 2)).resolves.toEqual({
      channel: 'talker:hello',
      args: ['a', 2],
    });

    const seen = jest.fn();
    ipc.on('talker:event', seen);
    listeners[0].listener('payload', 'second');
    expect(seen).toHaveBeenCalledWith('payload', 'second');
  });

  it('stops listening when the code that listened says so', async () => {
    const ipc = createExtensionIpc('Talker');
    await startWith(ipc);

    const stop = ipc.on('talker:event', jest.fn());
    const stopOther = ipc.on('talker:other', jest.fn());
    expect(listeners.map((entry) => entry.channel)).toEqual([
      'talker:event',
      'talker:other',
    ]);

    stop();
    expect(listeners.map((entry) => entry.channel)).toEqual(['talker:other']);
    // Stopping twice is harmless
    stop();
    stopOther();
    expect(listeners).toEqual([]);
  });

  it('removes every listener the code left behind when the extension is switched off', async () => {
    const ipc = createExtensionIpc('Talker');
    const host = await startWith(ipc);

    // A screen that opens and closes many times cleans up after itself...
    Array.from({ length: 50 }).forEach(() =>
      ipc.on('talker:tick', jest.fn())(),
    );
    // ...and two listeners nobody removes.
    ipc.on('talker:event', jest.fn());
    ipc.on('talker:other', jest.fn());
    expect(listeners).toHaveLength(2);

    await host.apply([describeExtension('disabled')]);

    expect(listeners).toEqual([]);
  });

  it("is a separate one for each of Studio's own extensions", () => {
    const all = [sqlIpc, analyticsIpc, notebooksIpc, pipelineIpc];
    expect(new Set(all).size).toBe(4);
    // None is usable until its extension is activated
    all.forEach((ipc) =>
      expect(() => ipc.invoke('x')).toThrow('the extension is not active'),
    );
  });
});
