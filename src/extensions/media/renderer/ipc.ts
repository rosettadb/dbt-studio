import { createExtensionIpc } from '../../../extensionApi/renderer';

/**
 * How the Media Viewer UI reaches its main-process handlers through `api.ipc`,
 * bound when the extension activates.
 */
export const ipc = createExtensionIpc('Media Viewer');
