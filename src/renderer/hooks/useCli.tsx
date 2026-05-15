import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { projectsServices } from '../services';

interface CliCommand {
  id: string;
  command: string;
  startTime: number;
  resolve?: (result: { output: string[]; error: string[] }) => void;
  reject?: (error: Error) => void;
  // eslint-disable-next-line no-undef
  timeoutId?: NodeJS.Timeout;
}

interface CliState {
  output: string[];
  error: string[];
  isRunning: boolean;
  currentCommand: CliCommand | null;
  commandHistory: string[];
}

interface CliContextValue extends CliState {
  runCommand: (
    command: string,
    timeoutMs?: number,
  ) => Promise<{ output: string[]; error: string[] }>;
  runCommandAsync: (command: string) => void; // Fire and forget for terminal usage
  stopCommand: () => void;
  clearOutput: () => void;
  sendInput: (input: string) => void;
}

const CliContext = createContext<CliContextValue | null>(null);

interface CliProviderProps {
  children: ReactNode;
}

export const CliProvider: React.FC<CliProviderProps> = ({ children }) => {
  const [state, setState] = useState<CliState>({
    output: [],
    error: [],
    isRunning: false,
    currentCommand: null,
    commandHistory: [],
  });

  const commandIdRef = useRef(0);
  const listenersSetupRef = useRef(false);

  // Generate unique command ID
  const generateCommandId = useCallback(() => {
    commandIdRef.current += 1;
    return `cmd_${commandIdRef.current}_${Date.now()}`;
  }, []);

  // Setup global event listeners (only once)
  useEffect(() => {
    if (listenersSetupRef.current) return;

    const handleOutput = (msg: any) => {
      setState((prev) => ({
        ...prev,
        output: [...prev.output, msg],
      }));
    };

    const handleError = (err: any) => {
      const errorMessage =
        typeof err === 'string'
          ? err
          : err?.message || err?.toString() || 'Unknown error';

      setState((prev) => ({
        ...prev,
        error: [...prev.error, errorMessage],
      }));
    };

    const handleDone = () => {
      setState((prev) => {
        // Resolve promise if it exists
        if (prev.currentCommand?.resolve) {
          prev.currentCommand.resolve({
            output: prev.output,
            error: prev.error,
          });
        }

        // Clear timeout
        if (prev.currentCommand?.timeoutId) {
          clearTimeout(prev.currentCommand.timeoutId);
        }

        return {
          ...prev,
          isRunning: false,
          currentCommand: null,
        };
      });
    };

    const handleClear = () => {
      setState((prev) => ({
        ...prev,
        output: [],
        error: [],
      }));
    };

    // Setup listeners
    const unsubOutput = window.electron.ipcRenderer.on(
      'cli:output',
      handleOutput,
    );
    const unsubError = window.electron.ipcRenderer.on('cli:error', handleError);
    const unsubDone = window.electron.ipcRenderer.on('cli:done', handleDone);
    const unsubClear = window.electron.ipcRenderer.on('cli:clear', handleClear);

    listenersSetupRef.current = true;

    // Cleanup on unmount
    // eslint-disable-next-line consistent-return
    return () => {
      if (typeof unsubOutput === 'function') unsubOutput();
      if (typeof unsubError === 'function') unsubError();
      if (typeof unsubDone === 'function') unsubDone();
      if (typeof unsubClear === 'function') unsubClear();
      listenersSetupRef.current = false;
    };
  }, []);

  // Clear output
  const clearOutput = useCallback(() => {
    setState((prev) => ({
      ...prev,
      output: [],
      error: [],
    }));
  }, []);

  // Send input to running command
  const sendInput = useCallback(
    (input: string) => {
      if (state.isRunning) {
        window.electron.ipcRenderer.sendMessage('cli:input', input);
      }
    },
    [state.isRunning],
  );

  // Stop current command
  const stopCommand = useCallback(() => {
    setState((prev) => {
      if (prev.currentCommand) {
        // Clear timeout
        if (prev.currentCommand.timeoutId) {
          clearTimeout(prev.currentCommand.timeoutId);
        }

        // Reject promise if it exists
        if (prev.currentCommand.reject) {
          prev.currentCommand.reject(new Error('Command was stopped by user'));
        }

        // Send stop signal
        try {
          window.electron.ipcRenderer.sendMessage('cli:stop');
        } catch {
          /* empty */
        }
      }

      return {
        ...prev,
        isRunning: false,
        currentCommand: null,
      };
    });
  }, []);

  // Run command with promise (for programmatic usage)
  const runCommand = useCallback(
    async (
      commandString: string,
      timeoutMs: number = 60000,
    ): Promise<{ output: string[]; error: string[] }> => {
      if (state.isRunning) {
        throw new Error('Another command is already running');
      }

      const commandId = generateCommandId();

      return new Promise<{ output: string[]; error: string[] }>(
        (resolve, reject) => {
          const timeoutId = setTimeout(() => {
            setState((prev) => ({
              ...prev,
              isRunning: false,
              currentCommand: null,
            }));
            reject(new Error(`Command timeout after ${timeoutMs}ms`));
          }, timeoutMs);

          const command: CliCommand = {
            id: commandId,
            command: commandString,
            startTime: Date.now(),
            resolve,
            reject,
            timeoutId,
          };

          // Clear previous output and start command
          setState((prev) => ({
            ...prev,
            output: [],
            error: [],
            isRunning: true,
            currentCommand: command,
            commandHistory: [...prev.commandHistory.slice(-19), commandString], // Keep last 20 commands
          }));

          // Execute command
          projectsServices.runCliCommand(commandString).catch((err) => {
            const errorMessage =
              err?.message || err?.toString() || 'Command failed';
            setState((prev) => ({
              ...prev,
              isRunning: false,
              currentCommand: null,
              error: [...prev.error, errorMessage],
            }));
            reject(new Error(errorMessage));
          });
        },
      );
    },
    [state.isRunning, generateCommandId],
  );

  // Run command without waiting for result (for terminal usage)
  const runCommandAsync = useCallback(
    (commandString: string) => {
      if (state.isRunning) {
        // Add to output to show command was ignored
        setState((prev) => ({
          ...prev,
          output: [
            ...prev.output,
            `Command ignored: Another command is running`,
          ],
        }));
        return;
      }

      const commandId = generateCommandId();
      const command: CliCommand = {
        id: commandId,
        command: commandString,
        startTime: Date.now(),
      };

      // Don't clear output for async commands, just add to it
      setState((prev) => ({
        ...prev,
        isRunning: true,
        currentCommand: command,
        commandHistory: [...prev.commandHistory.slice(-19), commandString],
      }));

      // Execute command
      projectsServices.runCliCommand(commandString).catch((err) => {
        const errorMessage =
          err?.message || err?.toString() || 'Command failed';
        setState((prev) => ({
          ...prev,
          error: [...prev.error, errorMessage],
        }));
      });
    },
    [state.isRunning, generateCommandId],
  );

  // eslint-disable-next-line react/jsx-no-constructed-context-values
  const contextValue: CliContextValue = {
    ...state,
    runCommand,
    runCommandAsync,
    stopCommand,
    clearOutput,
    sendInput,
  };

  return (
    <CliContext.Provider value={contextValue}>{children}</CliContext.Provider>
  );
};

const useCli = (): CliContextValue => {
  const context = useContext(CliContext);
  if (!context) {
    throw new Error('useCli must be used within a CliProvider');
  }
  return context;
};

export default useCli;
