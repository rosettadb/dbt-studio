/**
 * Speech (dictation) IPC Handlers
 * Thin wrappers (BE-01) delegating to SpeechService.
 */

import { app, ipcMain } from 'electron';
import SpeechService from '../services/speech.service';

let lifecycleRegistered = false;

export function registerSpeechHandlers() {
  ipcMain.handle('speech:status', () => SpeechService.getStatus());
  ipcMain.handle('speech:setup', () => SpeechService.setup());
  ipcMain.handle('speech:remove-model', () => SpeechService.removeModel());

  ipcMain.handle('speech:start', (event) => SpeechService.start(event.sender));
  ipcMain.on('speech:audio', (_event, chunk: ArrayBuffer | Uint8Array) =>
    SpeechService.feed(chunk),
  );
  ipcMain.handle('speech:stop', () => SpeechService.stop());

  if (!lifecycleRegistered) {
    lifecycleRegistered = true;
    app.on('before-quit', () => {
      SpeechService.shutdown();
    });
  }
}

export default registerSpeechHandlers;
