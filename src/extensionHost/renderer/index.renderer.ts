import { ExtensionHostRenderer } from './ExtensionHost.renderer';

/**
 * The one extension host of a window. The internal extensions are added to
 * it by the app's entry (`src/renderer/App.tsx`), not here, so that Studio
 * components can use the host without importing every extension.
 */
export const extensionHostRenderer = new ExtensionHostRenderer();

export type { ExtensionStatus } from './ExtensionHost.renderer';
