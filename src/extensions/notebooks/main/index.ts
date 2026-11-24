import type {
  ExtensionMainApi,
  ExtensionMainModule,
} from '../../../extensionApi/main';
import NotebookKernelService from '../../../extensionApi/studioMain/notebookKernelService';
import { registerNotebooksHandlers } from './notebooksHandlers';
import { registerPythonNotebooksHandlers } from './pythonNotebooksHandlers';

/**
 * Main-process half of the Notebooks extension: SQL notebooks, Python
 * notebooks with their environments and kernels, and the managed Python
 * interpreters they run on.
 */
const activate = (api: ExtensionMainApi): void => {
  registerNotebooksHandlers(api);
  registerPythonNotebooksHandlers(api);
};

// When Studio quits (or the extension is switched off) no kernel is left
// running.
const deactivate = async (): Promise<void> => {
  await NotebookKernelService.shutdownAll().catch(() => undefined);
};

export const notebooksMain: ExtensionMainModule = { activate, deactivate };
