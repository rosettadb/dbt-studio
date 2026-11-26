import { version } from '../../../package.json';
import { ExtensionHostMain } from './ExtensionHost.main';

/**
 * The one extension host of the main process. The internal extensions are
 * added to it in `ipc.main.ts` before it starts, not here, so that services
 * can use the host without importing every extension.
 */
export const extensionHost = new ExtensionHostMain({ studioVersion: version });

export { emitFileDidSave } from './fileEvents.main';
