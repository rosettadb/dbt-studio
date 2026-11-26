import type {
  StaticSiteBuildOptions,
  StaticSiteBuildResult,
  StaticSiteDeleteResult,
  StaticSiteState,
  StaticSiteBuildProgress,
} from '../shared/staticSite';
import { ipc } from './ipc';

export class StaticSiteService {
  static async build(
    opts: StaticSiteBuildOptions,
  ): Promise<StaticSiteBuildResult> {
    return ipc.invoke('analytics:static-site:build', opts);
  }

  static async openFolder(folderPath: string): Promise<void> {
    return ipc.invoke('analytics:static-site:open-folder', {
      path: folderPath,
    });
  }

  static async openPreview(folderPath: string): Promise<void> {
    return ipc.invoke('analytics:static-site:open-preview', {
      path: folderPath,
    });
  }

  static async getState(connectionId: string): Promise<StaticSiteState | null> {
    return ipc.invoke('analytics:static-site:get-state', { connectionId });
  }

  static async pickFolder(defaultPath: string): Promise<string | null> {
    return ipc.invoke('analytics:static-site:pick-folder', { defaultPath });
  }

  static async getDefaultOutputPath(connectionName: string): Promise<string> {
    return ipc.invoke('analytics:static-site:get-default-path', {
      connectionName,
    });
  }

  static async folderExists(folderPath: string): Promise<boolean> {
    return ipc.invoke('analytics:static-site:folder-exists', {
      path: folderPath,
    });
  }

  /**
   * Subscribe to streaming build progress events from the main process.
   * Returns an unsubscribe function — must be called on component unmount (FE-03).
   *
   * NOTE: ipc.on() strips IpcRendererEvent internally
   * and only passes the payload args, so the listener receives (progress) directly.
   */
  static subscribeToBuildProgress(
    callback: (progress: StaticSiteBuildProgress) => void,
  ): () => void {
    // The preload bridge's on() returns an unsubscribe function automatically.
    const unsubscribe = ipc.on(
      'analytics:static-site:build-progress',
      (...args: unknown[]) => {
        const progress = args[0] as StaticSiteBuildProgress;
        callback(progress);
      },
    );

    return unsubscribe as () => void;
  }

  static async deleteBuild(
    connectionId: string,
    outputPath: string,
  ): Promise<StaticSiteDeleteResult> {
    return ipc.invoke('analytics:static-site:delete-build', {
      connectionId,
      outputPath,
    });
  }
}
