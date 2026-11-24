import type { Disposable } from '../shared/protocol.shared';

/** `api.ipc` of the UI half, as an extension gets it in `activate`. */
type ApiIpc = {
  invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>;
  on: (channel: string, listener: (payload: any) => void) => Disposable;
};

/**
 * `api.ipc` for the code of an extension that is not inside `activate`:
 * its service files and components. The extension creates one, binds it to
 * `api.ipc` when it is activated, and its code calls `invoke` and `on` on
 * it. Every listener added this way is the extension's: it is removed when
 * the extension is switched off, also when the code that added it never
 * removed it.
 */
export interface ExtensionIpc {
  /** Called once in `activate` with `api.ipc`. */
  bind: (ipc: ApiIpc) => void;
  /** Calls a handler of the main process. */
  invoke: (channel: string, ...args: any[]) => Promise<any>;
  /** Listens to events of the main process. Returns the function that stops listening. */
  on: (channel: string, listener: (...args: any[]) => void) => () => void;
}

export const createExtensionIpc = (extensionName: string): ExtensionIpc => {
  let bound: ApiIpc | null = null;
  const required = (): ApiIpc => {
    if (!bound) {
      throw new Error(
        `${extensionName}: the extension is not active, so it cannot reach the main process`,
      );
    }
    return bound;
  };
  return {
    bind: (ipc) => {
      bound = ipc;
    },
    invoke: (channel, ...args) => required().invoke<any>(channel, ...args),
    on: (channel, listener) => {
      const subscription = required().on(channel, listener as any);
      return () => subscription.dispose();
    },
  };
};
