import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { BrowserWindow } from 'electron';
import * as os from 'os';

// Cross-platform process killer utility
import treeKill from 'tree-kill'; // You'll need to install: npm install tree-kill @types/tree-kill

interface ProcessInfo {
  pid: number;
  command: string;
  startTime: number;
  status: 'starting' | 'running' | 'stopping' | 'stopped';
  platform: string;
}

interface ProcessDoneResult {
  code: number | null;
  signal: string | null;
  duration: number;
  success: boolean;
  errorMessage?: string;
}

interface ProcessStartOptions {
  // When provided, the binary is spawned directly with these args (no shell
  // string interpolation) - needed for callers that must pass structured env
  // vars / paths safely (e.g. the local runner binary).
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  // Called in the main process when the process exits, in addition to the
  // 'done' IPC event sent to the renderer - lets a caller (e.g. the runner
  // IPC handler) react to completion without a renderer round-trip.
  onDone?: (result: ProcessDoneResult) => void;
}

class ProcessAdapter {
  private process: ChildProcessWithoutNullStreams | null = null;

  private processInfo: ProcessInfo | null = null;

  // eslint-disable-next-line no-undef
  private gracefulTimeoutId: NodeJS.Timeout | null = null;

  private mainWindow: BrowserWindow | null = null;

  private onDoneCallback: ProcessStartOptions['onDone'] | null = null;

  // Channel names are prefixed so multiple ProcessAdapter instances (e.g. the
  // shared "docs serve" process vs. the local runner) can broadcast on
  // distinct IPC channels instead of colliding on 'process:*'.
  private channelPrefix: string;

  constructor(channelPrefix: string = 'process') {
    this.channelPrefix = channelPrefix;
  }

  start(
    command: string,
    mainWindow: BrowserWindow,
    options?: ProcessStartOptions,
  ) {
    if (this.process) {
      throw new Error('A process is already running.');
    }

    this.mainWindow = mainWindow;
    this.onDoneCallback = options?.onDone ?? null;

    try {
      // Platform-specific command handling
      const platform = os.platform();
      let spawnCommand: string;
      let spawnArgs: string[];

      if (options?.args) {
        spawnCommand = command;
        spawnArgs = options.args;
      } else if (platform === 'win32') {
        spawnCommand = 'cmd';
        spawnArgs = ['/c', command];
      } else {
        spawnCommand = 'bash';
        spawnArgs = ['-c', command];
      }

      this.process = spawn(spawnCommand, spawnArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        // On Windows, create a new process group
        detached: platform !== 'win32',
        // Set up proper signal handling
        windowsHide: platform === 'win32',
        cwd: options?.cwd,
        env: options?.env ? { ...process.env, ...options.env } : undefined,
      });

      const { pid } = this.process;

      if (!pid) {
        throw new Error('Failed to get process PID');
      }

      this.processInfo = {
        pid,
        command,
        startTime: Date.now(),
        status: 'starting',
        platform,
      };

      this.sendEvent('started', {
        pid,
        command,
        startTime: this.processInfo.startTime,
        platform,
      });

      this.sendOutput(
        `Started process (PID: ${pid}) on ${platform}: ${command}`,
      );

      // Handle stdout
      this.process.stdout.on('data', (data) => {
        if (this.processInfo) {
          this.processInfo.status = 'running';
        }
        this.sendOutput(String(data));
      });

      // Handle stderr
      this.process.stderr.on('data', (data) => {
        if (this.processInfo) {
          this.processInfo.status = 'running';
        }
        this.sendError(String(data));
      });

      // Handle process close
      this.process.on('close', (code, signal) => {
        this.handleProcessEnd(code, signal, 'close');
      });

      // Handle process exit
      this.process.on('exit', (code, signal) => {
        this.handleProcessEnd(code, signal, 'exit');
      });

      // Handle process errors
      this.process.on('error', (err) => {
        this.sendError(`Process error: ${err.message || err.toString()}`);
        this.handleProcessEnd(-1, null, 'error', err.message);
      });

      // Mark as running after successful setup
      if (this.processInfo) {
        this.processInfo.status = 'running';
      }
    } catch (error) {
      this.cleanup();
      throw error;
    }
  }

  private handleProcessEnd(
    code: number | null,
    signal: string | null,
    eventType: string,
    errorMessage?: string,
  ) {
    if (!this.processInfo) return;

    const endTime = Date.now();
    const duration = endTime - this.processInfo.startTime;

    this.sendEvent('exit', {
      code,
      signal,
      duration,
      pid: this.processInfo.pid,
      eventType,
    });

    this.sendOutput(
      `Process ended (${eventType}) with code ${code}${signal ? `, signal ${signal}` : ''} after ${Math.round(duration / 1000)}s`,
    );

    const doneResult: ProcessDoneResult = {
      code,
      signal,
      duration,
      success: code === 0,
      errorMessage,
    };
    this.sendEvent('done', doneResult);
    this.onDoneCallback?.(doneResult);

    this.cleanup();
  }

  stop(force: boolean = false): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      if (!this.process || !this.processInfo) {
        resolve({ success: false, message: 'No process running' });
        return;
      }

      const { pid, platform } = this.processInfo;
      this.processInfo.status = 'stopping';

      this.sendOutput(
        `Stopping process (PID: ${pid})${force ? ' with force' : ' gracefully'}...`,
      );

      if (force) {
        // eslint-disable-next-line promise/catch-or-return
        this.forceKill(pid).then(resolve);
        return;
      }

      // Graceful stop
      try {
        // eslint-disable-next-line promise/catch-or-return
        this.gracefulStop(pid, platform).then(resolve);
      } catch (error) {
        // eslint-disable-next-line promise/catch-or-return
        this.forceKill(pid).then(resolve);
      }
    });
  }

  private gracefulStop(
    pid: number,
    platform: string,
  ): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      if (!this.process) {
        resolve({ success: false, message: 'Process not found' });
        return;
      }

      // Clear any existing timeout
      if (this.gracefulTimeoutId) {
        clearTimeout(this.gracefulTimeoutId);
      }

      // Set up timeout for force kill
      this.gracefulTimeoutId = setTimeout(() => {
        this.sendOutput('Graceful stop timeout, forcing termination...');
        // eslint-disable-next-line promise/catch-or-return
        this.forceKill(pid).then(resolve);
      }, 5000);

      // Listen for process to actually exit
      const cleanup = () => {
        if (this.gracefulTimeoutId) {
          clearTimeout(this.gracefulTimeoutId);
          this.gracefulTimeoutId = null;
        }
      };

      // Set up one-time listeners for process end
      const onClose = () => {
        cleanup();
        resolve({ success: true, message: 'Process stopped gracefully' });
      };

      const onError = () => {
        cleanup();
        // eslint-disable-next-line promise/catch-or-return
        this.forceKill(pid).then(resolve);
      };

      this.process.once('close', onClose);
      this.process.once('error', onError);

      try {
        if (platform === 'win32') {
          // On Windows, use tree-kill with SIGTERM equivalent
          treeKill(pid, 'SIGTERM', (err) => {
            if (err) {
              this.sendError(`Graceful stop failed: ${err.message}`);
              cleanup();
              // eslint-disable-next-line promise/catch-or-return,promise/no-promise-in-callback
              this.forceKill(pid).then(resolve);
            }
          });
        } else {
          // On Unix-like systems, send SIGTERM
          treeKill(pid, 'SIGTERM', (err) => {
            if (err) {
              this.sendError(`Graceful stop failed: ${err.message}`);
              cleanup();
              // eslint-disable-next-line promise/catch-or-return,promise/no-promise-in-callback
              this.forceKill(pid).then(resolve);
            }
          });
        }
      } catch (error) {
        cleanup();
        this.sendError(`Graceful stop error: ${error}`);
        // eslint-disable-next-line promise/catch-or-return
        this.forceKill(pid).then(resolve);
      }
    });
  }

  private forceKill(
    pid: number,
  ): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      this.sendOutput(`Force killing process tree (PID: ${pid})...`);

      treeKill(pid, 'SIGKILL', (err) => {
        if (err) {
          this.sendError(`Force kill failed: ${err.message}`);

          // Last resort: try direct process.kill
          try {
            if (this.process) {
              this.process.kill('SIGKILL');
            }
            resolve({
              success: true,
              message: 'Process force killed (direct)',
            });
          } catch (directKillErr) {
            resolve({
              success: false,
              message: `Failed to kill process: ${directKillErr}`,
            });
          }
        } else {
          resolve({
            success: true,
            message: 'Process tree force killed successfully',
          });
        }
      });
    });
  }

  private cleanup() {
    if (this.gracefulTimeoutId) {
      clearTimeout(this.gracefulTimeoutId);
      this.gracefulTimeoutId = null;
    }

    this.process = null;
    this.processInfo = null;
    this.mainWindow = null;
    this.onDoneCallback = null;
  }

  private sendEvent(event: string, data: any) {
    if (this.mainWindow) {
      this.mainWindow.webContents.send(`${this.channelPrefix}:${event}`, data);
    }
  }

  private sendOutput(message: string) {
    if (this.mainWindow) {
      this.mainWindow.webContents.send(`${this.channelPrefix}:output`, message);
    }
  }

  private sendError(message: string) {
    if (this.mainWindow) {
      this.mainWindow.webContents.send(`${this.channelPrefix}:error`, message);
    }
  }

  isRunning(): boolean {
    return !!this.process && this.processInfo?.status !== 'stopped';
  }

  getStatus() {
    if (!this.processInfo) {
      return {
        running: false,
        pid: null,
        command: null,
        startTime: null,
        duration: null,
        status: 'stopped',
        platform: os.platform(),
      };
    }

    return {
      running: this.isRunning(),
      pid: this.processInfo.pid,
      command: this.processInfo.command,
      startTime: this.processInfo.startTime,
      duration: Date.now() - this.processInfo.startTime,
      status: this.processInfo.status,
      platform: this.processInfo.platform,
    };
  }

  getPid(): number | null {
    return this.processInfo?.pid ?? null;
  }

  getProcessInfo(): ProcessInfo | null {
    return this.processInfo;
  }
}

export default ProcessAdapter;
