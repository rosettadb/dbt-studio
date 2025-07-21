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
        this.process = null; // Reset after close
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Process exited with error code ${code}`));
        }
      });

      this.process.on('error', (err) => {
        this.process = null; // Reset on error
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
        // Send exit event first
        mainWindow.webContents.send('cli:exit', code);

        // Always send done event for frontend to know command completed
        mainWindow.webContents.send('cli:done');

        // Reset process
        this.process = null;

        // Handle promise resolution
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
          // Don't call messageHandler with error type here since it calls stopCommand
          // Just add the exit code message directly
          mainWindow.webContents.send(
            'cli:output',
            `Process exited with code ${code}`,
          );
          reject(new Error(`Process exited with error code ${code}`));
        }
      });

      this.process.on('error', (err) => {
        this.messageHandler(
          {
            type: 'error',
            message: err?.message || err?.toString() || 'Unknown error',
          },
          mainWindow,
        );
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
      // Send done event before stopping so frontend knows command finished
      mainWindow.webContents.send('cli:done');
      this.stopCommand();
    }
    if (message.type === 'success') {
      mainWindow.webContents.send('cli:done', message.message);
      this.stopCommand();
    }
  };
}

export default CliAdapter;
