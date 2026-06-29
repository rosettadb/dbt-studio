import type {
  StaticSiteBuildOptions,
  StaticSiteBuildResult,
  StaticSiteState,
  StaticSiteBuildProgress,
} from '../../types/staticSite';

export class StaticSiteService {
  static async build(
    opts: StaticSiteBuildOptions,
  ): Promise<StaticSiteBuildResult> {
    return window.electron.ipcRenderer.invoke(
      'analytics:static-site:build',
      opts,
    );
  }

  static async openFolder(folderPath: string): Promise<void> {
    return window.electron.ipcRenderer.invoke(
      'analytics:static-site:open-folder',
      { path: folderPath },
    );
  }

  static async openPreview(folderPath: string): Promise<void> {
    return window.electron.ipcRenderer.invoke(
      'analytics:static-site:open-preview',
      { path: folderPath },
    );
  }

  static async getState(connectionId: string): Promise<StaticSiteState | null> {
    return window.electron.ipcRenderer.invoke(
      'analytics:static-site:get-state',
      { connectionId },
    );
  }

  static async pickFolder(defaultPath: string): Promise<string | null> {
    return window.electron.ipcRenderer.invoke(
      'analytics:static-site:pick-folder',
      { defaultPath },
    );
  }

  static async getDefaultOutputPath(connectionName: string): Promise<string> {
    return window.electron.ipcRenderer.invoke(
      'analytics:static-site:get-default-path',
      { connectionName },
    );
  }

  static async folderExists(folderPath: string): Promise<boolean> {
    return window.electron.ipcRenderer.invoke(
      'analytics:static-site:folder-exists',
      { path: folderPath },
    );
  }

  /**
   * Subscribe to streaming build progress events from the main process.
   * Returns an unsubscribe function — must be called on component unmount (FE-03).
   *
   * NOTE: window.electron.ipcRenderer.on() strips IpcRendererEvent internally
   * and only passes the payload args, so the listener receives (progress) directly.
   */
  static subscribeToBuildProgress(
    callback: (progress: StaticSiteBuildProgress) => void,
  ): () => void {
    // The preload bridge's on() returns an unsubscribe function automatically.
    const unsubscribe = window.electron.ipcRenderer.on(
      'analytics:static-site:build-progress',
      (...args: unknown[]) => {
        const progress = args[0] as StaticSiteBuildProgress;
        callback(progress);
      },
    );

    return unsubscribe as () => void;
  }
}
