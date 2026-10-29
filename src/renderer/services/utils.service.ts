import { FileNodeWithContent } from '../../types/backend';
import { client } from '../config/client';

export const getFileContentList = async (
  files: string[],
): Promise<FileNodeWithContent[]> => {
  const { data } = await client.post<string[], FileNodeWithContent[]>(
    'utils:getFileContentList',
    files,
  );
  return data;
};

export const openPath = (filePath: string): Promise<string> =>
  window.electron.ipcRenderer.invoke('utils:open-path', filePath);

/** Opens the OS file manager with the file selected. */
export const showItemInFolder = (filePath: string): Promise<void> =>
  window.electron.ipcRenderer.invoke('utils:show-item-in-folder', filePath);
