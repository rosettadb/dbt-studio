import React from 'react';
import { toast } from 'react-toastify';
import { useCli } from './index';
import { useGetSettings } from '../controllers';
import { Project } from '../../types/backend';

type DbtCommandType =
  | 'run'
  | 'test'
  | 'compile'
  | 'debug'
  | 'docs:generate'
  | 'docs:serve'
  | 'deps';

interface UseDbtReturn {
  run: (project: Project, path?: string) => Promise<void>;
  test: (project: Project, path?: string) => Promise<void>;
  compile: (project: Project, path?: string) => Promise<void>;
  debug: (project: Project) => Promise<void>;
  docsGenerate: (project: Project) => Promise<void>;
  docsServe: (project: Project) => Promise<void>;
  deps: (project: Project) => Promise<void>;
  isRunning: boolean;
  activeCommand: DbtCommandType | null;
}

const useDbt = (successCallback: () => void): UseDbtReturn => {
  const { data: settings } = useGetSettings();
  const { error, runCommand, isSuccess } = useCli();
  const [isRunning, setIsRunning] = React.useState(false);
  const [activeCommand, setActiveCommand] =
    React.useState<DbtCommandType | null>(null);

  React.useEffect(() => {
    if (!isRunning) return;
    if (error.length > 0) {
      toast.error(`dbt ${activeCommand} failed`);
      setIsRunning(false);
      setActiveCommand(null);
      return;
    }
    if (isSuccess) {
      toast.success(`dbt ${activeCommand} completed successfully`);
      setIsRunning(false);
      setActiveCommand(null);
      successCallback();
    }
  }, [isSuccess, error, activeCommand, successCallback]);

  const executeCommand = async (
    command: DbtCommandType,
    project: Project,
    args: string = '',
  ) => {
    if (isRunning) {
      toast.warning('Another dbt command is currently running');
      return;
    }

    setIsRunning(true);
    setActiveCommand(command);

    let cmdString = '';

    // Format the command string based on the command type
    switch (command) {
      case 'docs:generate':
        cmdString = `cd "${project.path}" && "${settings?.dbtPath}" docs generate`;
        break;
      case 'docs:serve':
        cmdString = `cd "${project.path}" && "${settings?.dbtPath}" docs serve`;
        break;
      default:
        cmdString = `cd "${project.path}" && "${settings?.dbtPath}" ${command} ${args}`;
    }

    await runCommand(cmdString).catch((err) => toast.error(err));
  };

  return {
    run: async (project: Project, path?: string) => {
      await executeCommand('run', project, path ? `--select ${path}` : '');
    },
    test: async (project: Project, path?: string) => {
      await executeCommand('test', project, path ? `--select ${path}` : '');
    },
    compile: async (project: Project, path?: string) => {
      await executeCommand('compile', project, path ? `--select ${path}` : '');
    },
    debug: async (project: Project) => {
      await executeCommand('debug', project);
    },
    docsGenerate: async (project: Project) => {
      await executeCommand('docs:generate', project);
    },
    docsServe: async (project: Project) => {
      await executeCommand('docs:serve', project);
    },
    deps: async (project: Project) => {
      await executeCommand('deps', project);
    },
    isRunning,
    activeCommand,
  };
};

export default useDbt;
