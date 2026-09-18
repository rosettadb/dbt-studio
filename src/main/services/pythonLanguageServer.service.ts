import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import type { WebContents } from 'electron';
import LineageService from './lineage.service';
import type {
  PythonLanguageDocument,
  PythonLanguageRequest,
  PythonLanguageEvent,
  PythonLanguageServerStatus,
  PythonLanguageDiagnostic,
} from '../../types/pythonLanguageServer';

const MAX_TEXT = 512 * 1024;
const MAX_MESSAGE = 2 * 1024 * 1024;
const METHODS = {
  completion: 'textDocument/completion',
  hover: 'textDocument/hover',
  signature: 'textDocument/signatureHelp',
};
type Document = PythonLanguageDocument & { uri: string; owner: WebContents };
type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** Owns only the editor server process. Notebook kernels have a separate lifecycle. */
export class PythonLanguageServerService {
  private child: ChildProcessWithoutNullStreams | null = null;

  private starting: Promise<boolean> | null = null;

  private probe: ChildProcessWithoutNullStreams | null = null;

  private cancelled = new Set<string>();

  private generation = 0;

  private suspended = false;

  private buffer = Buffer.alloc(0);

  private nextId = 0;

  private pending = new Map<number, Pending>();

  private requests = new Map<string, number>();

  private documents = new Map<string, Document>();

  private owners = new Map<number, WebContents>();

  private status: PythonLanguageServerStatus;

  constructor(
    private readonly pythonPath: string,
    private readonly root: string,
  ) {
    this.status = { state: 'needs-restart', version: null, pythonPath };
  }

  private publish(event: PythonLanguageEvent, owner?: WebContents) {
    const targets = owner ? [owner] : [...this.owners.values()];
    targets.forEach((target) => {
      if (!target.isDestroyed())
        target.send('notebooks:python:lsp:event', event);
    });
  }

  private setStatus(
    state: PythonLanguageServerStatus['state'],
    message?: string,
  ) {
    this.status = { ...this.status, state, message };
    this.publish({ type: 'status', status: this.status });
  }

  private trackOwner(owner: WebContents) {
    if (this.owners.has(owner.id)) return;
    this.owners.set(owner.id, owner);
    owner.once('destroyed', () => {
      [...this.documents.values()]
        .filter((doc) => doc.owner.id === owner.id)
        .forEach((doc) => this.close(doc.modelUri, owner));
      this.owners.delete(owner.id);
      if (!this.owners.size) this.stop();
    });
  }

  private send(message: object) {
    if (!this.child || this.child.stdin.destroyed)
      throw new Error('Python language server is unavailable.');
    const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }));
    if (
      body.length > MAX_MESSAGE ||
      this.child.stdin.writableLength > MAX_MESSAGE
    )
      throw new Error('Python editor request is too large.');
    this.child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
    this.child.stdin.write(body);
  }

  private notify(method: string, params: object) {
    this.send({ method, params });
  }

  private rpc(
    method: string,
    params: object,
    requestKey?: string,
  ): Promise<unknown> {
    if (this.pending.size >= 32)
      return Promise.reject(new Error('Python editor is busy.'));
    this.nextId += 1;
    const id = this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        if (requestKey) this.requests.delete(requestKey);
        if (this.child) this.notify('$/cancelRequest', { id });
        reject(new Error('Python language server timed out.'));
      }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      if (requestKey) this.requests.set(requestKey, id);
      try {
        this.send({ id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        if (requestKey) this.requests.delete(requestKey);
        reject(error);
      }
    }).finally(() => {
      if (requestKey) this.requests.delete(requestKey);
    });
  }

  private receive(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    try {
      while (this.buffer.length) {
        const headerEnd = this.buffer.indexOf('\r\n\r\n');
        if (headerEnd < 0) {
          if (this.buffer.length > 8192) throw new Error('Invalid LSP header');
          return;
        }
        const length = Number(
          this.buffer
            .subarray(0, headerEnd)
            .toString()
            .match(/Content-Length:\s*(\d+)/i)?.[1],
        );
        if (!Number.isSafeInteger(length) || length < 0 || length > MAX_MESSAGE)
          throw new Error('Invalid LSP size');
        if (this.buffer.length < headerEnd + 4 + length) return;
        const message = JSON.parse(
          this.buffer
            .subarray(headerEnd + 4, headerEnd + 4 + length)
            .toString(),
        );
        this.buffer = this.buffer.subarray(headerEnd + 4 + length);
        if (typeof message.id === 'number' && !message.method) {
          const pending = this.pending.get(message.id);
          if (pending) {
            clearTimeout(pending.timer);
            this.pending.delete(message.id);
            if (message.error)
              pending.reject(
                new Error(
                  'Python language server could not complete the request.',
                ),
              );
            else pending.resolve(message.result);
          }
        } else if (message.method === 'textDocument/publishDiagnostics') {
          const doc = [...this.documents.values()].find(
            (item) => item.uri === message.params?.uri,
          );
          if (
            !doc ||
            (message.params.version !== undefined &&
              message.params.version !== doc.version)
          )
            // eslint-disable-next-line no-continue
            continue;
          const diagnostics = (
            Array.isArray(message.params.diagnostics)
              ? message.params.diagnostics
              : []
          )
            .slice(0, 100)
            .filter(
              (item: PythonLanguageDiagnostic) =>
                item?.range?.start &&
                item?.range?.end &&
                typeof item.message === 'string',
            )
            .map((item: PythonLanguageDiagnostic) => ({
              range: item.range,
              severity: item.severity,
              message: item.message.slice(0, 4000),
            }));
          this.publish(
            {
              type: 'diagnostics',
              modelUri: doc.modelUri,
              version: doc.version,
              diagnostics,
            },
            doc.owner,
          );
        } else if (message.method && message.id !== undefined) {
          // No server-initiated edits, commands, configuration reads, or filesystem access.
          this.send({ id: message.id, result: null });
        }
      }
    } catch {
      this.stop();
      this.setStatus(
        'failed',
        'Invalid response from the Python language server. Restart editor intelligence.',
      );
    }
  }

  async getStatus(owner: WebContents): Promise<PythonLanguageServerStatus> {
    this.trackOwner(owner);
    await this.ensureStarted();
    return this.status;
  }

  private async ensureStarted(): Promise<boolean> {
    if (this.suspended) return false;
    if (this.status.state === 'ready' && this.child) return true;
    if (this.starting) return this.starting;
    if (this.status.state === 'missing' || this.status.state === 'failed')
      return false;
    const { generation } = this;
    this.starting = this.start(generation).finally(() => {
      if (generation === this.generation) this.starting = null;
    });
    return this.starting;
  }

  private async start(generation: number): Promise<boolean> {
    this.setStatus('starting');
    try {
      await fs.access(this.pythonPath);
      // Only OS essentials reach the analysis process, never provider/database credentials.
      const env: Record<string, string> = {};
      [
        'PATH',
        'HOME',
        'USERPROFILE',
        'SYSTEMROOT',
        'WINDIR',
        'TEMP',
        'TMP',
        'TMPDIR',
        'LANG',
        'LC_ALL',
      ].forEach((key) => {
        const value = process.env[key];
        if (value) env[key] = value;
      });
      const probe = spawn(
        this.pythonPath,
        [
          '-I',
          '-c',
          'import importlib.metadata as m; import pylsp, pyflakes; print(m.version("python-lsp-server"))',
        ],
        { shell: false, env, cwd: this.root },
      );
      this.probe = probe;
      const version = await new Promise<string>((resolve, reject) => {
        let output = '';
        const timer = setTimeout(() => {
          probe.kill();
          reject(new Error('Language server check timed out.'));
        }, 10000);
        probe.stdout.on('data', (data: Buffer) => {
          output = (output + data.toString()).slice(0, 128);
        });
        probe.stderr.resume();
        probe.on('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
        probe.on('close', (code) => {
          clearTimeout(timer);
          if (code === 0) resolve(output.trim());
          else reject(new Error('Missing language server'));
        });
      });
      if (generation !== this.generation || this.suspended) return false;
      this.probe = null;
      this.status.version = version;
      const child = spawn(this.pythonPath, ['-I', '-m', 'pylsp'], {
        shell: false,
        env,
        cwd: this.root,
      });
      this.child = child;
      child.stdout.on('data', (data: Buffer) => {
        if (this.child === child) this.receive(data);
      });
      child.stderr.resume();
      child.stdin.on('error', () => {
        if (this.child === child) this.fail();
      });
      child.on('error', () => {
        if (this.child === child) this.fail();
      });
      child.on('exit', () => {
        if (this.child === child) this.fail();
      });
      await this.rpc('initialize', {
        processId: process.pid,
        rootUri: pathToFileURL(this.root).toString(),
        capabilities: {
          textDocument: {
            completion: { completionItem: { snippetSupport: false } },
            publishDiagnostics: { versionSupport: true },
          },
        },
        initializationOptions: {},
      });
      if (generation !== this.generation) return false;
      this.notify('initialized', {});
      this.notify('workspace/didChangeConfiguration', {
        settings: {
          pylsp: {
            configurationSources: [],
            plugins: {
              jedi: { environment: this.pythonPath },
              jedi_completion: {
                enabled: true,
                include_params: false,
                include_class_objects: true,
                include_function_objects: true,
              },
              jedi_hover: { enabled: true },
              jedi_signature_help: { enabled: true },
              pyflakes: { enabled: true },
              pycodestyle: { enabled: false },
              mccabe: { enabled: false },
              pylint: { enabled: false },
              flake8: { enabled: false },
            },
          },
        },
      });
      this.documents.forEach((doc) => this.openDocument(doc));
      this.setStatus('ready');
      return true;
    } catch {
      if (generation !== this.generation) return false;
      const started = Boolean(this.child);
      this.stop();
      this.setStatus(
        started ? 'failed' : 'missing',
        started
          ? 'Could not start Python editor intelligence. Try restarting it.'
          : 'Install Python editor support in Notebook settings.',
      );
      return false;
    }
  }

  private fail() {
    this.stop();
    this.setStatus(
      'failed',
      'Python editor intelligence stopped. Restart it in Notebook settings.',
    );
  }

  stop(suspended = false) {
    this.generation += 1;
    this.suspended = suspended;
    this.starting = null;
    const { child } = this;
    this.child = null;
    this.probe?.kill();
    this.probe = null;
    child?.kill();
    this.buffer = Buffer.alloc(0);
    this.pending.forEach((pending) => {
      clearTimeout(pending.timer);
      pending.reject(new Error('Python language server stopped.'));
    });
    this.pending.clear();
    this.requests.clear();
    this.status.version = null;
    this.documents.forEach((doc) =>
      this.publish(
        {
          type: 'diagnostics',
          modelUri: doc.modelUri,
          version: doc.version,
          diagnostics: [],
        },
        doc.owner,
      ),
    );
    this.setStatus(
      'needs-restart',
      suspended ? 'Notebook packages are being changed.' : undefined,
    );
  }

  resume() {
    this.suspended = false;
    if (this.documents.size || this.owners.size)
      this.ensureStarted().catch(() => undefined);
  }

  async restart(owner: WebContents) {
    if (this.suspended) return this.status;
    this.stop();
    return this.getStatus(owner);
  }

  private static key(modelUri: string, owner: WebContents) {
    return `${owner.id}:${modelUri}`;
  }

  private async resolveUri(
    modelUri: string,
    owner: WebContents,
  ): Promise<string> {
    if (typeof modelUri !== 'string' || modelUri.length > 4096)
      throw new Error('Invalid Python model.');
    const uri = new URL(modelUri);
    if (
      /^\/__rosetta_python_notebooks__\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+\.py$/.test(
        uri.pathname,
      )
    ) {
      const name = createHash('sha256')
        .update(PythonLanguageServerService.key(modelUri, owner))
        .digest('hex');
      return pathToFileURL(
        path.join(this.root, `notebook-${name}.py`),
      ).toString();
    }
    if (
      uri.protocol !== 'dbt-file:' ||
      !uri.hostname ||
      uri.hostname === 'default' ||
      !uri.pathname.endsWith('.py')
    )
      throw new Error('Unsupported Python model.');
    const project = await LineageService.resolveProject(uri.hostname);
    const root = await fs.realpath(project.path);
    const decodedPath = decodeURIComponent(uri.pathname);
    const filePath =
      process.platform === 'win32'
        ? decodedPath.replace(/^\/([a-zA-Z]:)/, '$1')
        : decodedPath;
    const file = await fs.realpath(filePath);
    const relative = path.relative(root, file);
    if (
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    )
      throw new Error('Python file is outside its project.');
    return pathToFileURL(file).toString();
  }

  private openDocument(doc: Document) {
    this.notify('textDocument/didOpen', {
      textDocument: {
        uri: doc.uri,
        languageId: 'python',
        version: doc.version,
        text: doc.text,
      },
    });
  }

  async sync(
    input: PythonLanguageDocument,
    owner: WebContents,
  ): Promise<boolean> {
    if (
      !input ||
      typeof input.text !== 'string' ||
      Buffer.byteLength(input.text) > MAX_TEXT ||
      !Number.isSafeInteger(input.version) ||
      input.version < 1
    )
      throw new Error('Invalid Python document.');
    this.trackOwner(owner);
    const key = PythonLanguageServerService.key(input.modelUri, owner);
    const previous = this.documents.get(key);
    if (!previous && this.documents.size >= 100)
      throw new Error('Too many Python documents.');
    const uri = previous?.uri ?? (await this.resolveUri(input.modelUri, owner));
    const ready = await this.ensureStarted();
    if (owner.isDestroyed()) return false;
    const current = this.documents.get(key);
    if (current && input.version < current.version) return ready;
    const doc = { ...input, uri, owner };
    this.documents.set(key, doc);
    if (ready) {
      if (!current) this.openDocument(doc);
      else if (current.version !== doc.version || current.text !== doc.text)
        this.notify('textDocument/didChange', {
          textDocument: { uri, version: doc.version },
          contentChanges: [{ text: doc.text }],
        });
    }
    return ready;
  }

  close(modelUri: string, owner: WebContents) {
    const key = PythonLanguageServerService.key(modelUri, owner);
    const doc = this.documents.get(key);
    if (doc && this.status.state === 'ready')
      this.notify('textDocument/didClose', { textDocument: { uri: doc.uri } });
    this.documents.delete(key);
  }

  cancel(requestId: string, owner: WebContents) {
    if (typeof requestId !== 'string' || requestId.length > 128) return;
    const key = PythonLanguageServerService.key(requestId, owner);
    if (this.cancelled.size >= 128) this.cancelled.clear();
    this.cancelled.add(key);
    const id = this.requests.get(key);
    const pending = id === undefined ? undefined : this.pending.get(id);
    if (id !== undefined && pending) {
      this.notify('$/cancelRequest', { id });
      clearTimeout(pending.timer);
      this.pending.delete(id);
      this.requests.delete(key);
      pending.resolve(null);
    }
  }

  async request(
    input: PythonLanguageRequest,
    owner: WebContents,
  ): Promise<unknown> {
    if (
      !input ||
      !Object.prototype.hasOwnProperty.call(METHODS, input.kind) ||
      typeof input.requestId !== 'string' ||
      input.requestId.length > 128 ||
      !Number.isSafeInteger(input.line) ||
      input.line < 0 ||
      !Number.isSafeInteger(input.character) ||
      input.character < 0
    )
      throw new Error('Invalid Python editor request.');
    const requestKey = PythonLanguageServerService.key(input.requestId, owner);
    if (this.cancelled.delete(requestKey)) return null;
    if (!(await this.sync(input, owner))) return null;
    if (this.cancelled.delete(requestKey)) return null;
    const doc = this.documents.get(
      PythonLanguageServerService.key(input.modelUri, owner),
    );
    if (!doc || doc.version !== input.version) return null;
    return this.rpc(
      METHODS[input.kind],
      {
        textDocument: { uri: doc.uri },
        position: { line: input.line, character: input.character },
      },
      PythonLanguageServerService.key(input.requestId, owner),
    );
  }
}
