import { ChildProcess, spawn, exec } from 'child_process';
import path from 'path';
import http from 'http';
import fs from 'fs-extra';
import { promisify } from 'util';
import SettingsService from './settings.service';

const execAsync = promisify(exec);

let flowfileProcess: ChildProcess | null = null;

const getFlowfileBinPath = async (): Promise<string | null> => {
  const settings = await SettingsService.loadSettings();
  if (!settings.pythonPath) return null;

  const binDir = path.dirname(settings.pythonPath);
  const ext = process.platform === 'win32' ? '.exe' : '';
  const candidate = path.join(binDir, `flowfile${ext}`);
  return (await fs.pathExists(candidate)) ? candidate : null;
};

const getUiPort = async (): Promise<number> => {
  const settings = await SettingsService.loadSettings();
  const parsed = parseInt(settings.flowfilePort ?? '63578', 10);
  return Number.isNaN(parsed) ? 63578 : parsed;
};

const checkPortOpen = (port: number): Promise<boolean> => {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/ui`, (res) => {
      res.resume();
      resolve(res.statusCode !== undefined && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
};

export type FlowfileStatus = {
  processRunning: boolean;
  serviceUp: boolean;
  url: string;
  version: string | null;
};

export type FlowfileResult = {
  ok: boolean;
  error?: string;
};

export class FlowfileService {
  static async getInstalledVersion(): Promise<string | null> {
    const settings = await SettingsService.loadSettings();
    if (!settings.pythonPath) return null;

    try {
      const { stdout } = await execAsync(
        `"${settings.pythonPath}" -m pip show Flowfile`,
      );
      const match = stdout.match(/Version:\s*(.+)/);
      return match ? match[1].trim() : null;
    } catch {
      return null;
    }
  }

  static async install(): Promise<FlowfileResult> {
    const settings = await SettingsService.loadSettings();
    if (!settings.pythonPath) {
      return {
        ok: false,
        error: 'Python path not configured. Set it in Settings > General first.',
      };
    }

    try {
      await execAsync(
        `"${settings.pythonPath}" -m pip install --upgrade Flowfile`,
      );
      const version = await this.getInstalledVersion();
      if (version) {
        const current = await SettingsService.loadSettings();
        await SettingsService.saveSettings({ ...current, flowfileVersion: version });
      }
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Install failed',
      };
    }
  }

  static async start(): Promise<FlowfileResult> {
    if (flowfileProcess && !flowfileProcess.killed) {
      return { ok: true };
    }

    const bin = await getFlowfileBinPath();
    if (!bin) {
      return {
        ok: false,
        error: 'Flowfile binary not found. Install it from Settings > Flowfile.',
      };
    }

    try {
      flowfileProcess = spawn(bin, ['run', 'ui'], {
        detached: false,
        stdio: 'pipe',
      });
      flowfileProcess.on('exit', () => {
        flowfileProcess = null;
      });
      return { ok: true };
    } catch (error) {
      flowfileProcess = null;
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to start Flowfile',
      };
    }
  }

  static async stop(): Promise<FlowfileResult> {
    if (!flowfileProcess || flowfileProcess.killed) {
      flowfileProcess = null;
      return { ok: true };
    }

    try {
      flowfileProcess.kill('SIGTERM');
      flowfileProcess = null;
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to stop Flowfile',
      };
    }
  }

  static async getStatus(): Promise<FlowfileStatus> {
    const port = await getUiPort();
    const settings = await SettingsService.loadSettings();
    const processRunning = !!(flowfileProcess && !flowfileProcess.killed);
    const serviceUp = await checkPortOpen(port);

    return {
      processRunning,
      serviceUp,
      url: `http://127.0.0.1:${port}/ui`,
      version: settings.flowfileVersion || null,
    };
  }
}
