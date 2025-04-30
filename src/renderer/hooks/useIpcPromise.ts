import { Channels } from '../../types/ipc';

const useIpcPromise = <T = undefined, R = void>(channel: Channels) => {
  return async (data?: T) => {
    const resolve: R = await window.electron.ipcRenderer.invoke(channel, data);
    return resolve;
  };
};
export default useIpcPromise;
