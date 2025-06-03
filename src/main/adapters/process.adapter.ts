import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import psTree from 'ps-tree';
import { BrowserWindow } from 'electron';

class ProcessAdapter {
  private process: ChildProcessWithoutNullStreams | null = null;

  private pid: number | null = null;

  start(command: string, mainWindow: BrowserWindow) {
    if (this.process) throw new Error('A process is already running.');

    this.process = spawn(command, { shell: true });
    this.pid = this.process.pid ?? null;

    mainWindow.webContents.send(
      'cli:output',
      `Started process (PID: ${this.pid})`,
    );

    this.process.stdout.on('data', (data) => {
      mainWindow.webContents.send('cli:output', String(data));
    });

    this.process.stderr.on('data', (data) => {
      mainWindow.webContents.send('cli:error', String(data));
    });

    this.process.on('close', (code) => {
      mainWindow.webContents.send(
        'cli:output',
        `Process exited with code ${code}`,
      );
      this.process = null;
      this.pid = null;
    });
  }

  stop() {
    if (!this.process || !this.pid) return;

    const { pid } = this;
    this.process = null;
    this.pid = null;

    psTree(pid, (err, children) => {
      if (err) {
        return;
      }

      const childPids = children.map((p) => Number(p.PID));
      childPids.forEach((childPid) => {
        try {
          process.kill(childPid, 'SIGKILL');
        } catch {
          /* empty */
        }
      });

      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        /* empty */
      }
    });
  }

  isRunning(): boolean {
    return !!this.process;
  }

  getPid(): number | null {
    return this.pid;
  }
}

export default ProcessAdapter;
