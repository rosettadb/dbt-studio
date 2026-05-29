import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { Channels } from '../types/ipc';
import { version } from '../../package.json';
import {
  parseSerializedError,
  SerializedError,
  SERIALIZED_ERROR_PREFIX,
} from './utils/errorSerializer';

/**
 * Rebuilds a real Error from the payload our main-process IPC wrapper encodes
 * into the rejected error's message. Electron prefixes the message with
 * "Error invoking remote method '<channel>': ", so we search the whole string
 * for the encoded marker rather than relying on the message starting with it.
 */
const rawMessageOf = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return '';
};

const reviveIpcError = (err: unknown): unknown => {
  const raw = rawMessageOf(err);
  const markerIdx = raw.indexOf(SERIALIZED_ERROR_PREFIX);
  if (markerIdx === -1) return err;

  const serialized: SerializedError | null = parseSerializedError(
    raw.slice(markerIdx),
  );
  if (!serialized) return err;

  const revived = new Error(serialized.message);
  revived.name = serialized.name;
  if (serialized.stack) revived.stack = serialized.stack;
  // Attach structured fields (status, code, body, cause, ...) for renderer parsing.
  Object.assign(revived, {
    ...(serialized.data ?? {}),
    cause: serialized.cause,
    serialized,
  });
  return revived;
};

const electronHandler = {
  ipcRenderer: {
    sendMessage(channel: Channels, ...args: unknown[]) {
      ipcRenderer.send(channel, ...args);
    },
    on(channel: Channels, func: (...args: unknown[]) => void) {
      const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
        func(...args);
      ipcRenderer.on(channel, subscription);

      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    once(channel: Channels, func: (...args: unknown[]) => void) {
      ipcRenderer.once(channel, (_event, ...args) => func(...args));
    },
    removeListener(channel: Channels, func: (...args: unknown[]) => void) {
      ipcRenderer.removeListener(channel, func);
    },
    invoke(channel: Channels, ...args: unknown[]) {
      return ipcRenderer.invoke(channel, ...args).catch((err) => {
        throw reviveIpcError(err);
      });
    },
  },
  app: {
    version,
    os: process.platform,
    arch: process.arch,
    isDebug:
      process.env.NODE_ENV === 'development' ||
      process.env.DEBUG_PROD === 'true',
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
