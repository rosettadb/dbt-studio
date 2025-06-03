/* eslint global-require: off, no-console: off, promise/always-return: off */
import { Channels } from '../../types/ipc';

const client = {
  get: async <R = void>(channel: Channels) => {
    const resolve: R = await window.electron.ipcRenderer.invoke(channel);
    if (window.electron.app.isDebug) {
      console.debug('get', channel);
      console.debug('response', resolve);
    }
    return { data: resolve };
  },
  post: async <T = undefined, R = void>(channel: Channels, body: T) => {
    const resolve: R = await window.electron.ipcRenderer.invoke(channel, body);
    if (window.electron.app.isDebug) {
      console.debug('post', channel, body);
      console.debug('response', resolve);
    }
    return { data: resolve };
  },
};

export { client };
