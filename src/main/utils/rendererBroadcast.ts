import { BrowserWindow } from 'electron';
import type { Channels } from '../../types/ipc';

/**
 * Push an event to every live renderer window. Used by main-process services
 * that emit progress / lifecycle events without holding a window reference.
 */
export function broadcastToRenderers(channel: Channels, payload: unknown) {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  });
}
