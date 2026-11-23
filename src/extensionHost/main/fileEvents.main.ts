import { BrowserWindow } from 'electron';
import {
  toDisposable,
  type Disposable,
  type ExtensionHostChannels,
  type FileDidSaveEvent,
  type FileSaveSource,
} from '../shared/protocol.shared';

/**
 * The one place a "file was saved" event starts. The project file service
 * calls it for editor saves and the AI file tools call it for agent writes.
 * It reaches main-process listeners directly and every window over IPC.
 * It imports no service, so any service can import it.
 */
type Listener = (event: FileDidSaveEvent) => void;

const listeners = new Set<Listener>();
const DID_SAVE_CHANNEL: ExtensionHostChannels = 'extensions:file:didSave';

export const onDidSaveFile = (listener: Listener): Disposable => {
  listeners.add(listener);
  return toDisposable(() => {
    listeners.delete(listener);
  });
};

export const emitFileDidSave = (path: string, source: FileSaveSource): void => {
  const event: FileDidSaveEvent = { path, source };
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[extensions] onDidSaveFile listener failed:', error);
    }
  });
  // getAllWindows is absent when this runs outside Electron (unit tests).
  const windows =
    typeof BrowserWindow?.getAllWindows === 'function'
      ? BrowserWindow.getAllWindows()
      : [];
  windows.forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send(DID_SAVE_CHANNEL, event);
  });
};
