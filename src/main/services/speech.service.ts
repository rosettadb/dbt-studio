/**
 * Speech Service
 *
 * Offline speech-to-text for the AI chat input. Recognition runs in a child
 * process (`resources/python/speech_bridge.py`, Vosk) spawned from the
 * studio's managed Python environment, so a crash or memory spike there never
 * touches the app window. The renderer streams 16 kHz PCM over IPC; this
 * service pipes it to the child's stdin and relays its JSON events back.
 *
 * Setup is one-time and fully local afterwards: `pip install vosk` into the
 * studio venv plus a model archive download from Alpha Cephei (Apache-2.0).
 *
 * Follows BE-03 (one cohesive service).
 */

import { app, WebContents } from 'electron';
import { ChildProcess, spawn } from 'child_process';
import axios from 'axios';
import AdmZip from 'adm-zip';
import fs from 'fs-extra';
import path from 'path';
import SettingsService from './settings.service';
import { broadcastToRenderers } from '../utils/rendererBroadcast';
import type {
  SpeechSessionEvent,
  SpeechSetupEvent,
  SpeechStatus,
} from '../../types/speech';

const MODEL_NAME = 'vosk-model-small-en-us-0.15';
const MODEL_LABEL = 'English (small)';
const MODEL_SIZE_MB = 40;
const MODEL_SOURCE = 'alphacephei.com';
const MODEL_URL = `https://alphacephei.com/vosk/models/${MODEL_NAME}.zip`;
/** File that must exist for the extracted model to be considered complete. */
const MODEL_MARKER = path.join('am', 'final.mdl');

const VOSK_PACKAGE = 'vosk';
const SAMPLE_RATE = 16000;

const PIP_TIMEOUT_MS = 10 * 60 * 1000;
const CHECK_TIMEOUT_MS = 60 * 1000;
const READY_TIMEOUT_MS = 60 * 1000;
const EXIT_TIMEOUT_MS = 5 * 1000;

const BRIDGE_RELATIVE = ['resources', 'python', 'speech_bridge.py'];

function getBridgePath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, ...BRIDGE_RELATIVE);
  }
  // Dev: the main bundle lives in .erb/dll (two levels below the repo root);
  // unbundled runs (ts-node / tests) start from src/main/services.
  const candidates = [
    path.join(__dirname, '..', '..', ...BRIDGE_RELATIVE),
    path.join(__dirname, '..', '..', '..', ...BRIDGE_RELATIVE),
    path.join(process.cwd(), ...BRIDGE_RELATIVE),
  ];
  return (
    candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0]
  );
}

interface ProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

function runProcess(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill('SIGTERM');
      } catch {
        // The process may have exited before the timeout callback ran.
      }
      reject(new Error(`Process timed out after ${timeoutMs}ms: ${command}`));
    }, timeoutMs);

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };

    child.stdout.on('data', (data) => {
      stdout += String(data);
    });
    child.stderr.on('data', (data) => {
      stderr += String(data);
    });
    child.on('error', (error) => finish(() => reject(error)));
    child.on('close', (exitCode) =>
      finish(() => resolve({ exitCode, stdout, stderr })),
    );
  });
}

interface Session {
  child: ChildProcess;
  sender: WebContents;
  exited: Promise<void>;
}

export default class SpeechService {
  /** Dedupe concurrent setups. */
  private static setupRun: Promise<void> | null = null;

  /** `import vosk` result, keyed by interpreter path. Cleared by setup. */
  private static voskInstalledCache = new Map<string, boolean>();

  /** Only one microphone, so only one session at a time. */
  private static session: Session | null = null;

  // ── Paths ──────────────────────────────────────────────────────────

  static getModelsDir(): string {
    return path.join(app.getPath('userData'), 'speech-models');
  }

  static getModelDir(): string {
    return path.join(this.getModelsDir(), MODEL_NAME);
  }

  private static isModelInstalled(): boolean {
    return fs.existsSync(path.join(this.getModelDir(), MODEL_MARKER));
  }

  /** The studio venv interpreter, or null when Python is not set up. */
  private static async getPython(): Promise<string | null> {
    const settings = await SettingsService.loadSettings();
    const pythonPath = settings.pythonPath?.trim();
    if (!pythonPath || !fs.existsSync(pythonPath)) return null;
    return pythonPath;
  }

  private static async isVoskInstalled(python: string): Promise<boolean> {
    const cached = this.voskInstalledCache.get(python);
    if (cached !== undefined) return cached;
    let installed = false;
    try {
      const result = await runProcess(
        python,
        ['-c', `import ${VOSK_PACKAGE}`],
        CHECK_TIMEOUT_MS,
      );
      installed = result.exitCode === 0;
    } catch {
      installed = false;
    }
    this.voskInstalledCache.set(python, installed);
    return installed;
  }

  // ── Status / setup ─────────────────────────────────────────────────

  static async getStatus(): Promise<SpeechStatus> {
    const python = await this.getPython();
    const pythonInstalled = python !== null;
    const voskInstalled = python ? await this.isVoskInstalled(python) : false;
    const modelInstalled = this.isModelInstalled();

    let status: SpeechStatus['status'];
    if (!pythonInstalled) status = 'unavailable';
    else if (this.setupRun) status = 'installing';
    else if (voskInstalled && modelInstalled) status = 'ready';
    else status = 'needs-setup';

    return {
      status,
      pythonInstalled,
      voskInstalled,
      modelInstalled,
      modelLabel: MODEL_LABEL,
      modelSizeMb: MODEL_SIZE_MB,
      modelSource: MODEL_SOURCE,
    };
  }

  static async setup(): Promise<void> {
    if (this.setupRun) return this.setupRun;
    const run = this.performSetup().finally(() => {
      this.setupRun = null;
    });
    this.setupRun = run;
    return run;
  }

  private static emitSetup(event: SpeechSetupEvent) {
    broadcastToRenderers('speech:setup-event', event);
  }

  private static async performSetup(): Promise<void> {
    const python = await this.getPython();
    if (!python) {
      const message =
        'Install Python from Settings before setting up dictation.';
      this.emitSetup({ phase: 'error', error: message });
      throw new Error(message);
    }

    try {
      if (!(await this.isVoskInstalled(python))) {
        this.emitSetup({ phase: 'installing-package' });
        const install = await runProcess(
          python,
          ['-m', 'pip', 'install', '--no-cache-dir', VOSK_PACKAGE],
          PIP_TIMEOUT_MS,
        );
        if (install.exitCode !== 0) {
          throw new Error(
            install.stderr.trim() ||
              install.stdout.trim() ||
              `pip install ${VOSK_PACKAGE} exited with code ${install.exitCode}`,
          );
        }
        this.voskInstalledCache.delete(python);
        if (!(await this.isVoskInstalled(python))) {
          throw new Error(
            `The ${VOSK_PACKAGE} package was installed but cannot be imported.`,
          );
        }
      }

      if (!this.isModelInstalled()) {
        await this.downloadModel();
      }

      this.emitSetup({ phase: 'done', percentage: 100 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emitSetup({ phase: 'error', error: message });
      throw new Error(`Failed to set up dictation: ${message}`);
    }
  }

  private static async downloadModel(): Promise<void> {
    const modelsDir = this.getModelsDir();
    const modelDir = this.getModelDir();
    const archivePath = path.join(modelsDir, `${MODEL_NAME}.zip.download`);

    try {
      await fs.mkdirp(modelsDir);
      this.emitSetup({ phase: 'downloading', percentage: 0 });

      const response = await axios.get(MODEL_URL, { responseType: 'stream' });
      const total = Number(response.headers['content-length'] ?? 0);
      let loaded = 0;
      let lastEmit = 0;

      await new Promise<void>((resolve, reject) => {
        const out = fs.createWriteStream(archivePath);
        response.data.on('data', (chunk: Buffer) => {
          loaded += chunk.length;
          const now = Date.now();
          if (total > 0 && now - lastEmit > 250) {
            lastEmit = now;
            this.emitSetup({
              phase: 'downloading',
              percentage: Math.round((loaded / total) * 100),
            });
          }
        });
        response.data.on('error', reject);
        out.on('error', reject);
        out.on('finish', () => resolve());
        response.data.pipe(out);
      });

      this.emitSetup({ phase: 'extracting' });
      await fs.remove(modelDir);
      // The archive contains a single top-level `<MODEL_NAME>/` directory.
      const zip = new AdmZip(archivePath);
      zip.extractAllTo(modelsDir, true);

      if (!this.isModelInstalled()) {
        throw new Error('Speech model files missing after extraction');
      }
    } catch (error) {
      await fs.remove(modelDir).catch(() => undefined);
      throw error;
    } finally {
      await fs.remove(archivePath).catch(() => undefined);
    }
  }

  static async removeModel(): Promise<void> {
    await this.stop().catch(() => undefined);
    await fs.remove(this.getModelDir());
  }

  // ── Dictation session ──────────────────────────────────────────────

  private static sendEvent(session: Session, event: SpeechSessionEvent) {
    if (!session.sender.isDestroyed()) {
      session.sender.send('speech:event', event);
    }
  }

  /**
   * Spawn the recogniser for the calling window. Resolves once the model is
   * loaded and audio may be sent; rejects if the child fails to start.
   */
  static async start(sender: WebContents): Promise<void> {
    if (this.session) {
      await this.stop().catch(() => undefined);
    }

    const python = await this.getPython();
    if (!python) {
      throw new Error('Install Python from Settings before using dictation.');
    }
    if (!this.isModelInstalled()) {
      throw new Error('The speech model is not installed.');
    }
    const bridge = getBridgePath();
    if (!(await fs.pathExists(bridge))) {
      throw new Error(`Speech bridge script not found at ${bridge}`);
    }

    const child = spawn(
      python,
      [bridge, '--model', this.getModelDir(), '--rate', String(SAMPLE_RATE)],
      {
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          PYTHONIOENCODING: 'utf-8',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );

    let resolveReady!: () => void;
    let rejectReady!: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    // Avoid unhandled rejection noise if nobody awaits `ready` after failure.
    ready.catch(() => undefined);

    let resolveExited!: () => void;
    const exited = new Promise<void>((resolve) => {
      resolveExited = resolve;
    });

    const session: Session = { child, sender, exited };
    this.session = session;

    let stderr = '';
    let stdoutBuffer = '';

    child.stdout?.setEncoding('utf-8');
    child.stdout?.on('data', (data: string) => {
      stdoutBuffer += data;
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() ?? '';
      lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        let event: SpeechSessionEvent;
        try {
          event = JSON.parse(trimmed) as SpeechSessionEvent;
        } catch {
          return;
        }
        if (event.type === 'ready') resolveReady();
        if (event.type === 'error') rejectReady(new Error(event.message));
        this.sendEvent(session, event);
      });
    });
    child.stderr?.setEncoding('utf-8');
    child.stderr?.on('data', (data: string) => {
      stderr += data;
    });
    // Writing to a dead pipe must not crash the main process.
    child.stdin?.on('error', () => undefined);

    child.on('error', (error) => {
      rejectReady(error);
      this.sendEvent(session, { type: 'error', message: error.message });
    });
    child.on('close', (code) => {
      if (code !== 0 && code !== null) {
        const message =
          stderr.trim().split('\n').pop() ||
          `Speech recogniser exited with code ${code}`;
        rejectReady(new Error(message));
        this.sendEvent(session, { type: 'error', message });
      }
      this.sendEvent(session, { type: 'ended' });
      if (this.session === session) this.session = null;
      resolveExited();
    });

    const timeout = setTimeout(() => {
      rejectReady(new Error('Timed out waiting for the speech recogniser.'));
    }, READY_TIMEOUT_MS);

    try {
      await ready;
    } catch (error) {
      try {
        child.kill();
      } catch {
        // Already gone.
      }
      if (this.session === session) this.session = null;
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Forward a PCM chunk from the renderer to the recogniser. */
  static feed(chunk: ArrayBuffer | Uint8Array): void {
    const { session } = this;
    if (!session || !session.child.stdin || session.child.stdin.destroyed) {
      return;
    }
    const buffer =
      chunk instanceof ArrayBuffer
        ? Buffer.from(chunk)
        : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    session.child.stdin.write(buffer);
  }

  /**
   * Close the audio stream so the recogniser flushes its final phrase and
   * exits. Resolves once the process is gone (killed after a grace period).
   */
  static async stop(): Promise<void> {
    const { session } = this;
    if (!session) return;
    this.session = null;

    session.child.stdin?.end();
    const timeout = setTimeout(() => {
      try {
        session.child.kill();
      } catch {
        // Already gone.
      }
    }, EXIT_TIMEOUT_MS);
    try {
      await session.exited;
    } finally {
      clearTimeout(timeout);
    }
  }

  static shutdown(): void {
    const { session } = this;
    if (!session) return;
    this.session = null;
    try {
      session.child.kill();
    } catch {
      // Already gone.
    }
  }
}
