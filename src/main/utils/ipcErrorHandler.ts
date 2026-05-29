import { ipcMain } from 'electron';
import { encodeError, serializeError } from './errorSerializer';

let patched = false;

/**
 * Globally wraps `ipcMain.handle` so that any error thrown by a handler is
 * fully serialized and re-thrown as an Error whose message carries the real
 * error payload. This lets the renderer recover the original error details
 * instead of receiving "[object Object]".
 *
 * Must be called once, before any handlers are registered. Idempotent.
 */
export const installIpcErrorHandling = (): void => {
  if (patched) return;
  patched = true;

  const originalHandle = ipcMain.handle.bind(ipcMain);

  ipcMain.handle = (
    channel: string,
    listener: (...args: any[]) => unknown,
  ): void => {
    originalHandle(channel, async (...args: any[]) => {
      try {
        return await listener(...args);
      } catch (error) {
        const serialized = serializeError(error);
        // eslint-disable-next-line no-console
        console.error(`[IPC] Handler "${channel}" failed:`, {
          message: serialized.message,
          ...(serialized.data ? { data: serialized.data } : {}),
          stack: serialized.stack,
        });
        // Throw a fresh Error whose message is the encoded payload. Electron
        // transfers the message string to the renderer, where it can be decoded.
        throw new Error(encodeError(error));
      }
    });
  };
};
