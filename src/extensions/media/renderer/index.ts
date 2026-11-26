import type {
  ExtensionRendererApi,
  ExtensionRendererModule,
} from '../../../extensionApi/renderer';
import { mediaFileView } from './MediaFileView';
import { ipc } from './ipc';

/**
 * UI half of the Media Viewer extension: registers the file view handler for
 * supported image and video formats in the project editor.
 */
const activate = (api: ExtensionRendererApi): void => {
  ipc.bind(api.ipc);
  api.fileViews.add(mediaFileView);
};

export const mediaRenderer: ExtensionRendererModule = {
  activate,
};
