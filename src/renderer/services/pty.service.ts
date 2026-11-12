import type {
  PtyCreateRequest,
  PtyDataEvent,
  PtyExitEvent,
  PtySessionInfo,
  PtySnapshot,
  PtyTitleEvent,
  ShellProfilesResult,
} from '../../types/pty';

/** Thin IPC wrappers for the OS shell terminal (src/main/services/pty.service.ts). */

export const getShellProfiles = (): Promise<ShellProfilesResult> =>
  window.electron.ipcRenderer.invoke('pty:profiles');

export const createPtySession = (
  request: PtyCreateRequest,
): Promise<PtySessionInfo> =>
  window.electron.ipcRenderer.invoke('pty:create', request);

export const listPtySessions = (): Promise<PtySessionInfo[]> =>
  window.electron.ipcRenderer.invoke('pty:list');

export const getPtySnapshot = (id: string): Promise<PtySnapshot | null> =>
  window.electron.ipcRenderer.invoke('pty:snapshot', id);

export const killPtySession = (id: string): Promise<boolean> =>
  window.electron.ipcRenderer.invoke('pty:kill', id);

export const renamePtySession = (
  id: string,
  title: string,
): Promise<PtySessionInfo | null> =>
  window.electron.ipcRenderer.invoke('pty:rename', { id, title });

export const writeToPty = (id: string, data: string, binary = false): void =>
  window.electron.ipcRenderer.sendMessage('pty:write', { id, data, binary });

export const resizePty = (id: string, cols: number, rows: number): void =>
  window.electron.ipcRenderer.sendMessage('pty:resize', { id, cols, rows });

export const acknowledgePtyData = (id: string, chars: number): void =>
  window.electron.ipcRenderer.sendMessage('pty:ack', { id, chars });

export const onPtyData = (listener: (event: PtyDataEvent) => void) =>
  window.electron.ipcRenderer.on('pty:data', (payload) =>
    listener(payload as PtyDataEvent),
  );

export const onPtyExit = (listener: (event: PtyExitEvent) => void) =>
  window.electron.ipcRenderer.on('pty:exit', (payload) =>
    listener(payload as PtyExitEvent),
  );

export const onPtyTitle = (listener: (event: PtyTitleEvent) => void) =>
  window.electron.ipcRenderer.on('pty:title', (payload) =>
    listener(payload as PtyTitleEvent),
  );

export const openExternalLink = (url: string): Promise<boolean> =>
  window.electron.ipcRenderer.invoke('open:external', url);
