import { createExtensionIpc } from '../../../extensionApi/renderer';

/**
 * How the UI of this extension reaches the main process: `api.ipc`, bound
 * in `activate`. Its service files and components call `ipc.invoke` and
 * `ipc.on`, not the window's IPC directly, so every listener is removed
 * when the extension is switched off.
 */
export const ipc = createExtensionIpc('Pipelines');
