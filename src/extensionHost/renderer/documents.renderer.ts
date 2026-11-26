import {
  toDisposable,
  type Disposable,
  type FileDidSaveEvent,
} from '../shared/protocol.shared';

/**
 * The hook points around a project file: before it is saved, after it was
 * saved, when it is opened in the editor and when it is closed.
 *
 * Every save in the window goes through `projectsServices.saveFileContent`,
 * which runs the will-save participants here before it writes. "Saved"
 * events come from the main process, so they also fire for files an AI
 * agent wrote.
 */

/** Why a file is being saved. A formatter usually acts on `manual` only. */
export type FileSaveReason =
  /** The user asked for it: Save, Ctrl/Cmd+S, Save All, Save and close. */
  | 'manual'
  /** Saved on the user's behalf before something else, e.g. before a run. */
  | 'auto'
  /** Written by code: an applied AI edit, a restore, a newly created file. */
  | 'programmatic';

export interface FileWillSaveEvent {
  path: string;
  /** What is about to be written, including changes by earlier participants. */
  content: string;
  reason: FileSaveReason;
}

/**
 * Runs before a file is written. Returning a string replaces the content
 * that gets written; returning nothing leaves it as it is.
 */
export type FileWillSaveParticipant = (
  event: FileWillSaveEvent,
) => string | void | Promise<string | void>;

export interface FileOpenCloseEvent {
  path: string;
}

/** A participant that takes longer than this is skipped; the save goes on. */
export const WILL_SAVE_TIMEOUT_MS = 3_000;

const willSaveParticipants: FileWillSaveParticipant[] = [];
const didSaveListeners = new Set<(event: FileDidSaveEvent) => void>();
const didOpenListeners = new Set<(event: FileOpenCloseEvent) => void>();
const didCloseListeners = new Set<(event: FileOpenCloseEvent) => void>();
let savedContentSink: ((path: string, content: string) => void) | null = null;

const report = (what: string, error: unknown) =>
  // eslint-disable-next-line no-console
  console.error(`[extensions] ${what} failed:`, error);

export const onWillSaveFile = (
  participant: FileWillSaveParticipant,
): Disposable => {
  willSaveParticipants.push(participant);
  return toDisposable(() => {
    const index = willSaveParticipants.indexOf(participant);
    if (index >= 0) willSaveParticipants.splice(index, 1);
  });
};

const subscribe = <T>(listeners: Set<T>, listener: T): Disposable => {
  listeners.add(listener);
  return toDisposable(() => {
    listeners.delete(listener);
  });
};

export const onDidSaveFile = (
  listener: (event: FileDidSaveEvent) => void,
): Disposable => subscribe(didSaveListeners, listener);

export const onDidOpenFile = (
  listener: (event: FileOpenCloseEvent) => void,
): Disposable => subscribe(didOpenListeners, listener);

export const onDidCloseFile = (
  listener: (event: FileOpenCloseEvent) => void,
): Disposable => subscribe(didCloseListeners, listener);

const emit = <E>(listeners: Set<(event: E) => void>, event: E, what: string) =>
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch (error) {
      report(what, error);
    }
  });

export const emitFileDidSave = (event: FileDidSaveEvent): void =>
  emit(didSaveListeners, event, 'onDidSave listener');

export const emitFileDidOpen = (path: string): void =>
  emit(didOpenListeners, { path }, 'onDidOpen listener');

export const emitFileDidClose = (path: string): void =>
  emit(didCloseListeners, { path }, 'onDidClose listener');

const withTimeout = async <T>(work: Promise<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Timed out after ${WILL_SAVE_TIMEOUT_MS} ms`)),
      WILL_SAVE_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Runs the will-save participants one after the other and returns what
 * should be written. A participant that throws or is too slow is skipped:
 * a broken extension must never stop a file from being saved.
 */
export const runWillSaveParticipants = async (
  event: FileWillSaveEvent,
): Promise<string> => {
  if (willSaveParticipants.length === 0) return event.content;
  return [...willSaveParticipants].reduce(async (previous, participant) => {
    const content = await previous;
    try {
      const replaced = await withTimeout(
        Promise.resolve(participant({ ...event, content })),
      );
      return typeof replaced === 'string' ? replaced : content;
    } catch (error) {
      report('onWillSave participant', error);
      return content;
    }
  }, Promise.resolve(event.content));
};

/**
 * Who shows the file's text (the editor tabs) registers here to be told
 * when a participant changed what was written, so the open tab shows what
 * is on disk.
 */
export const setSavedContentSink = (
  sink: ((path: string, content: string) => void) | null,
): void => {
  savedContentSink = sink;
};

export const notifySavedContentChanged = (
  path: string,
  content: string,
): void => {
  try {
    savedContentSink?.(path, content);
  } catch (error) {
    report('saved content sink', error);
  }
};
