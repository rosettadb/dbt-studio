/* eslint-disable no-use-before-define */
import { useEffect, useRef, useState } from 'react';
import { projectsServices } from '../services';

type CliState = {
  output: string[];
  error: string[];
  isRunning: boolean;
  isSuccess: boolean | null;
};

const useCli = () => {
  const [cliState, setCliState] = useState<CliState>({
    output: [],
    error: [],
    isRunning: false,
    isSuccess: null,
  });

  const doneHandlerRef = useRef<(() => void) | null>(null);
  const errorHandlerRef = useRef<(err: string) => void>();

  useEffect(() => {
    const handleOutput = (msg: any) => {
      setCliState((prev) => ({ ...prev, output: [...prev.output, msg] }));
    };

    const handleError = (err: any) => {
      setCliState((prev) => ({
        ...prev,
        error: [...prev.error, err],
        isRunning: false,
        isSuccess: false,
      }));
      errorHandlerRef.current?.(err);
    };

    const handleClear = () => {
      setCliState({
        output: [],
        error: [],
        isRunning: false,
        isSuccess: null,
      });
    };

    const handleDone = () => {
      setCliState((prev) => ({ ...prev, isRunning: false, isSuccess: true }));
      doneHandlerRef.current?.();
    };

    window.electron.ipcRenderer.on('cli:output', handleOutput);
    window.electron.ipcRenderer.on('cli:error', handleError);
    window.electron.ipcRenderer.on('cli:clear', handleClear);
    window.electron.ipcRenderer.on('cli:done', handleDone);

    return () => {
      window.electron.ipcRenderer.removeListener('cli:output', handleOutput);
      window.electron.ipcRenderer.removeListener('cli:error', handleError);
      window.electron.ipcRenderer.removeListener('cli:clear', handleClear);
      window.electron.ipcRenderer.removeListener('cli:done', handleDone);
    };
  }, []);

  const runCommand = async (command: string): Promise<void> => {
    setCliState({
      output: [],
      error: [],
      isRunning: true,
      isSuccess: null,
    });

    return new Promise<void>((resolve, reject) => {
      doneHandlerRef.current = () => {
        doneHandlerRef.current = null;
        errorHandlerRef.current = undefined;
        resolve();
      };

      errorHandlerRef.current = (err: string) => {
        doneHandlerRef.current = null;
        errorHandlerRef.current = undefined;
        reject(new Error(err));
      };

      projectsServices.runCliCommand(command).catch((err) => {
        errorHandlerRef.current?.(err.message || 'Command failed');
      });
    });
  };

  const sendInput = (input: string) => {
    window.electron.ipcRenderer.sendMessage('cli:input', input);
  };

  const stopCommand = () => {
    window.electron.ipcRenderer.sendMessage('cli:stop');
    setCliState((prev) => ({ ...prev, isRunning: false }));
  };

  return {
    ...cliState,
    runCommand,
    sendInput,
    stopCommand,
  };
};

export default useCli;
