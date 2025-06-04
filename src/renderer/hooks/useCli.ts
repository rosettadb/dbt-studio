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
  const commandInProgressRef = useRef<boolean>(false);

  useEffect(() => {
    const handleOutput = (msg: any) => {
      // Only handle if not in command-specific mode
      if (!commandInProgressRef.current) {
        setCliState((prev) => ({ ...prev, output: [...prev.output, msg] }));
      }
    };

    const handleError = (err: any) => {
      // Only handle if not in command-specific mode
      if (!commandInProgressRef.current) {
        setCliState((prev) => ({
          ...prev,
          error: [...prev.error, err],
          isRunning: false,
          isSuccess: false,
        }));
        errorHandlerRef.current?.(err);
      }
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
      // Only handle if not in command-specific mode
      if (!commandInProgressRef.current) {
        setCliState((prev) => ({ ...prev, isRunning: false, isSuccess: true }));
        doneHandlerRef.current?.();
      }
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

  const runCommand = async (command: string): Promise<{ output: string[]; error: string[] }> => {
    // Prevent multiple concurrent commands
    if (commandInProgressRef.current) {
      throw new Error('Another command is already running');
    }

    commandInProgressRef.current = true;

    setCliState({
      output: [],
      error: [],
      isRunning: true,
      isSuccess: null,
    });

    return new Promise<{ output: string[]; error: string[] }>((resolve, reject) => {
      let currentOutput: string[] = [];
      let currentError: string[] = [];
      let resolved = false;

      const handleOutput = (msg: any) => {
        if (!resolved) {
          currentOutput = [...currentOutput, msg];
          setCliState((prev) => ({ ...prev, output: [...prev.output, msg] }));
        }
      };

      const handleError = (err: any) => {
        if (!resolved) {
          currentError = [...currentError, err];
          setCliState((prev) => ({
            ...prev,
            error: [...prev.error, err],
            isRunning: false,
            isSuccess: false,
          }));
        }
      };

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          commandInProgressRef.current = false;
          clearTimeout(timeoutId);
          window.electron.ipcRenderer.removeListener('cli:output', handleOutput);
          window.electron.ipcRenderer.removeListener('cli:error', handleError);
          window.electron.ipcRenderer.removeListener('cli:done', handleDone);
        }
      };

      const handleDone = () => {
        if (!resolved) {
          cleanup();
          setCliState((prev) => ({ ...prev, isRunning: false, isSuccess: true }));
          resolve({
            output: currentOutput,
            error: currentError
          });
        }
      };

      // Add timeout to prevent hanging
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          cleanup();
          reject(new Error('Command timeout'));
        }
      }, 60000); // 60 second timeout

      window.electron.ipcRenderer.on('cli:output', handleOutput);
      window.electron.ipcRenderer.on('cli:error', handleError);
      window.electron.ipcRenderer.on('cli:done', handleDone);

      projectsServices.runCliCommand(command).catch((err) => {
        if (!resolved) {
          cleanup();
          reject(new Error(err.message || 'Command failed'));
        }
      });
    });
  };

  const sendInput = (input: string) => {
    window.electron.ipcRenderer.sendMessage('cli:input', input);
  };

  const stopCommand = () => {
    commandInProgressRef.current = false;
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
