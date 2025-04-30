import React from 'react';
import { Channels } from '../../types/ipc';

const useIpcRenderer = <T = unknown>(
  channel: Channels,
  callback: (event: any, data: T) => void,
) => {
  React.useEffect(() => {
    const handler = (event: any, data: unknown) => callback(event, data as T);
    window.electron.ipcRenderer.on(channel, handler);
    return () => {
      window.electron.ipcRenderer.removeListener(channel, handler);
    };
  }, [channel, callback]);
};

export default useIpcRenderer;
