import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { BrowserWindow } from 'electron';
import { CliMessage } from '../../types/backend';

class CliAdapter {
  private process: ChildProcessWithoutNullStreams | null = null;

  getProcess(): ChildProcessWithoutNullStreams | null {
    return this.process;
  }

  async runCommandWithoutStreaming(command: string) {
    return new Promise<void>((resolve, reject) => {
      if (this.process) {
        reject(new Error('A command is already running. Please wait.'));
        return;
      }
      this.process = spawn(command, { shell: true });

      this.process.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Process exited with error code ${code}`));
        }
      });

      this.process.on('error', (err) => {
        reject(err);
      });
    });
  }

  runCommand(mainWindow: BrowserWindow, command: string) {
    return new Promise<void>((resolve, reject) => {
      if (this.process) {
        reject(new Error('A command is already running. Please wait.'));
        return;
      }
      mainWindow.webContents.send('cli:clear');
      this.process = spawn(command, { shell: true });
      this.messageHandler(
        {
          type: 'info',
          message: command,
        },
        mainWindow,
      );

      this.process.stdout.on('data', (data) => {
        const message = String(data);
        this.messageHandler(
          {
            type: 'info',
            message,
          },
          mainWindow,
        );
      });

      this.process.stderr.on('data', (data) => {
        const message = String(data);
        this.messageHandler({ type: 'info', message }, mainWindow);
      });

      this.process.on('close', (code) => {
        if (code === 0) {
          this.messageHandler(
            {
              type: 'success',
              message: `Command executed successfully.`,
            },
            mainWindow,
          );
          resolve();
        } else {
          this.messageHandler(
            {
              type: 'error',
              message: `Process exited with error code ${code}`,
            },
            mainWindow,
          );
          resolve();
        }
      });

      this.process.on('error', (err) => {
        this.messageHandler(
          {
            type: 'error',
            message: err.message,
          },
          mainWindow,
        );
        this.process = null;
        reject(err);
      });
    });
  }

  sendInput(input: string) {
    if (this.process && this.process.stdin) {
      this.process.stdin.write(`${input}\n`);
    }
  }

  stopCommand() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  messageHandler = (message: CliMessage, mainWindow: BrowserWindow) => {
    if (message.type === 'info') {
      mainWindow.webContents.send('cli:output', message.message);
    }
    if (message.type === 'error') {
      mainWindow.webContents.send('cli:error', message.message);
      this.stopCommand();
    }
    if (message.type === 'success') {
      mainWindow.webContents.send('cli:done', message.message);
      this.stopCommand();
    }
  };
}

export default CliAdapter;
