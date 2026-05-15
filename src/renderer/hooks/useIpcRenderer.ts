import React from 'react';
import { Channels } from '../../types/ipc';

const useIpcRenderer = <T = unknown>(
  channel: Channels,
  callback: (event: any, data: T) => void,
) => {
  React.useEffect(() => {
    const handler = (event: any, data: unknown) => callback(event, data as T);
    const unsub = window.electron.ipcRenderer.on(channel, handler);
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [channel, callback]);
};

export default useIpcRenderer;
