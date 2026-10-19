/**
 * Speech-to-text (dictation) types.
 *
 * Dictation runs fully offline: the renderer captures the microphone and
 * streams 16 kHz PCM to the main process, which pipes it into a Vosk
 * recogniser running in the studio's managed Python environment. Nothing
 * leaves the machine; the only network access is the one-time model download.
 */

export type SpeechSetupStatus =
  /** The studio's managed Python is not installed — dictation is hidden. */
  | 'unavailable'
  /** Python is present but the vosk package and/or model are missing. */
  | 'needs-setup'
  /** A setup (package install + model download) is in progress. */
  | 'installing'
  /** Everything is in place; dictation can start. */
  | 'ready';

export interface SpeechStatus {
  status: SpeechSetupStatus;
  pythonInstalled: boolean;
  voskInstalled: boolean;
  modelInstalled: boolean;
  /** Human-readable model name (e.g. "English (small)"). */
  modelLabel: string;
  /** Approximate download size of the model archive, for the setup prompt. */
  modelSizeMb: number;
  /** Where the model archive is downloaded from, shown in the setup prompt. */
  modelSource: string;
}

export type SpeechSetupPhase =
  | 'installing-package'
  | 'downloading'
  | 'extracting'
  | 'done'
  | 'error';

export interface SpeechSetupEvent {
  phase: SpeechSetupPhase;
  /** 0..100 when known (download phase). */
  percentage?: number;
  error?: string;
}

/** Events emitted by the recogniser during a dictation session. */
export type SpeechSessionEvent =
  | { type: 'ready' }
  /** In-progress hypothesis for the phrase currently being spoken. */
  | { type: 'partial'; text: string }
  /** A finished phrase. */
  | { type: 'result'; text: string }
  | { type: 'error'; message: string }
  /** The recogniser process has exited; no more events will follow. */
  | { type: 'ended' };
