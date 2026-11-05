/**
 * Speech Service (renderer)
 *
 * Thin wrappers over window.electron.ipcRenderer for offline dictation.
 *
 * FE-03: every `ipcRenderer.on` subscription lives here and returns an
 * unsubscribe closure; components never subscribe directly.
 */

import type {
  SpeechSessionEvent,
  SpeechSetupEvent,
  SpeechStatus,
} from '../../types/speech';

const { ipcRenderer } = window.electron;

export const speechService = {
  status: (): Promise<SpeechStatus> => ipcRenderer.invoke('speech:status'),

  setup: (): Promise<void> => ipcRenderer.invoke('speech:setup'),

  removeModel: (): Promise<void> => ipcRenderer.invoke('speech:remove-model'),

  onSetupEvent: (handler: (event: SpeechSetupEvent) => void): (() => void) =>
    ipcRenderer.on('speech:setup-event', (...args: unknown[]) =>
      handler(args[0] as SpeechSetupEvent),
    ),

  /** Resolves once the recogniser is ready to receive audio. */
  start: (): Promise<void> => ipcRenderer.invoke('speech:start'),

  /** Fire-and-forget: one chunk of 16 kHz mono 16-bit PCM. */
  sendAudio: (pcm: ArrayBuffer): void =>
    ipcRenderer.sendMessage('speech:audio', pcm),

  /** Resolves once the recogniser has flushed its final phrase and exited. */
  stop: (): Promise<void> => ipcRenderer.invoke('speech:stop'),

  onSessionEvent: (
    handler: (event: SpeechSessionEvent) => void,
  ): (() => void) =>
    ipcRenderer.on('speech:event', (...args: unknown[]) =>
      handler(args[0] as SpeechSessionEvent),
    ),
};
