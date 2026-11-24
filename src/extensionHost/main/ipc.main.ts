import {
  app,
  dialog,
  ipcMain,
  net,
  shell,
  BrowserWindow,
  type MessageBoxOptions,
  type OpenDialogOptions,
} from 'electron';
import fs from 'fs-extra';
import { pathToFileURL } from 'url';
import { extensionHost } from './index.main';
import { installIpcErrorHandling } from '../../main/utils/ipcErrorHandler';
import { builtinMainExtensions } from './builtinExtensions.main';
// Studio's own databases, registered before any extension adds one.
import '../../connections/registry.main';
import {
  getExtensionsRoot,
  stageInstall,
  discardStaged,
} from './extensionStore.main';
import { extensionIdOf } from '../shared/manifest.shared';
import type {
  ExtensionBridgeResponse,
  ExtensionHostChannels,
  ExtensionInstallResult,
} from '../shared/protocol.shared';

const handle = (
  channel: ExtensionHostChannels,
  listener: (...args: any[]) => unknown,
): void => {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, listener);
};

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Lets the user pick a folder or a `.zip`, shows what it is and asks for
 * confirmation, then installs it.
 */
const installFromDialog = async (
  kind: 'folder' | 'file',
): Promise<ExtensionInstallResult> => {
  const window = BrowserWindow.getFocusedWindow();
  const openOptions: OpenDialogOptions =
    kind === 'folder'
      ? {
          title: 'Install extension from folder',
          properties: ['openDirectory'],
        }
      : {
          title: 'Install extension',
          properties: ['openFile'],
          filters: [{ name: 'Extension package', extensions: ['zip'] }],
        };
  const picked = window
    ? await dialog.showOpenDialog(window, openOptions)
    : await dialog.showOpenDialog(openOptions);
  const sourcePath = picked.filePaths[0];
  if (picked.canceled || !sourcePath) return { status: 'cancelled' };

  try {
    // Read the manifest first so the confirmation names what is installed.
    const preview = stageInstall(sourcePath);
    const { manifest } = preview;
    discardStaged(preview);

    const confirmOptions: MessageBoxOptions = {
      type: 'warning',
      buttons: ['Install', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: `Install "${manifest.displayName ?? manifest.name}" ${manifest.version}?`,
      detail: `${extensionIdOf(manifest)}\n\nAn extension runs with the same access to your files, connections and credentials as Studio itself. Install it only if you trust where it comes from.`,
    };
    const confirmed = window
      ? await dialog.showMessageBox(window, confirmOptions)
      : await dialog.showMessageBox(confirmOptions);
    if (confirmed.response !== 0) return { status: 'cancelled' };

    const id = await extensionHost.install(sourcePath);
    return { status: 'installed', id };
  } catch (error) {
    return { status: 'failed', error: messageOf(error) };
  }
};

let startPromise: Promise<void> | null = null;

/**
 * Adds the internal extensions and starts the host. Idempotent: it is
 * called while Studio starts (so extensions can prepare behind the splash
 * screen) and again when a window registers its handlers.
 */
export const startExtensionHost = (): Promise<void> => {
  if (!startPromise) {
    // Handlers that extensions register must report errors like Studio's.
    installIpcErrorHandling();
    builtinMainExtensions.forEach(({ manifest, module }) =>
      extensionHost.registerBuiltin(manifest, module),
    );
    startPromise = extensionHost.start().catch((error) => {
      // eslint-disable-next-line no-console
      console.error('[extensions] Host failed to start:', error);
    });
  }
  return startPromise;
};

/**
 * Registers the host's own channels for a window and makes sure the host
 * runs. Safe to call more than once: `registerHandlers` runs for the main
 * and the setup window.
 */
export const registerExtensionHostHandlers = (window: BrowserWindow): void => {
  extensionHost.setMainWindow(window);

  handle('extensions:list', async () => {
    await extensionHost.whenReady();
    return extensionHost.list();
  });
  handle(
    'extensions:setEnabled',
    async (_event, body: { id: string; enabled: boolean }) => {
      await extensionHost.setEnabled(body.id, body.enabled);
      return extensionHost.list();
    },
  );
  handle('extensions:install', (_event, body: { kind: 'folder' | 'file' }) =>
    installFromDialog(body?.kind === 'folder' ? 'folder' : 'file'),
  );
  handle('extensions:uninstall', async (_event, body: { id: string }) => {
    await extensionHost.uninstall(body.id);
    return extensionHost.list();
  });
  handle('extensions:openFolder', async () => {
    const root = getExtensionsRoot();
    fs.ensureDirSync(root);
    return shell.openPath(root);
  });
  handle('extensions:restart', () => {
    app.relaunch();
    app.quit();
  });
  handle(
    'extensions:bridge:response',
    (_event, response: ExtensionBridgeResponse) => {
      extensionHost.resolveBridgeResponse(response);
    },
  );

  startExtensionHost();
};

/**
 * Serves `rosetta-ext://<extension id>/<path>` from the folder of that
 * installed extension, and nothing outside it.
 */
export const handleExtensionProtocol = (
  request: Request,
): Promise<Response> | Response => {
  try {
    const url = new URL(request.url);
    const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const filePath = extensionHost.resolveResource(url.hostname, relativePath);
    if (!filePath || !fs.existsSync(filePath)) {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(filePath).toString(), {
      bypassCustomProtocolHandlers: true,
    });
  } catch {
    return new Response('Bad request', { status: 400 });
  }
};
