import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { spawn } from 'child_process';
import type { WebContents } from 'electron';
import { PythonLanguageServerService } from '../../../src/main/services/pythonLanguageServer.service';
import LineageService from '../../../src/main/services/lineage.service';

jest.mock('child_process', () => ({ spawn: jest.fn() }));
jest.mock('fs/promises', () => ({
  access: jest.fn().mockResolvedValue(undefined),
  realpath: jest.fn(async (value: string) => value),
}));
jest.mock('../../../src/main/services/lineage.service', () => ({
  __esModule: true,
  default: {
    resolveProject: jest.fn().mockResolvedValue({ path: '/project' }),
  },
}));

const frame = (message: object) => {
  const body = Buffer.from(JSON.stringify(message));
  return Buffer.concat([
    Buffer.from(`Content-Length: ${body.length}\r\n\r\n`),
    body,
  ]);
};
const owner = (id = 1) =>
  Object.assign(new EventEmitter(), {
    id,
    send: jest.fn(),
    isDestroyed: () => false,
  }) as unknown as WebContents;
const document = {
  modelUri: 'file:///__rosetta_python_notebooks__/notebook-1/cell-1.py',
  text: 'import math\nmath.',
  version: 1,
};

function fakeProcess() {
  const process = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    stdin: new PassThrough(),
    kill: jest.fn(() => true),
  });
  return process;
}

describe('Python language-server integration boundary', () => {
  let service: PythonLanguageServerService;
  let server: ReturnType<typeof fakeProcess>;
  let messages: Record<string, any>[];
  let replyToCompletions: boolean;

  beforeEach(() => {
    jest.clearAllMocks();
    messages = [];
    replyToCompletions = true;
    (spawn as jest.Mock).mockImplementation((_exe, args: string[]) => {
      const child = fakeProcess();
      if (args.includes('-c')) {
        queueMicrotask(() => {
          child.stdout.write('1.14.0\n');
          child.emit('close', 0);
        });
      } else {
        server = child;
        let input = Buffer.alloc(0);
        child.stdin.on('data', (chunk: Buffer) => {
          input = Buffer.concat([input, chunk]);
          const end = input.indexOf('\r\n\r\n');
          if (end < 0) return;
          const length = Number(
            input.subarray(0, end).toString().split(':')[1],
          );
          if (input.length < end + 4 + length) return;
          const message = JSON.parse(
            input.subarray(end + 4, end + 4 + length).toString(),
          );
          input = input.subarray(end + 4 + length);
          messages.push(message);
          if (
            message.method === 'initialize' ||
            (replyToCompletions && message.id)
          ) {
            const result =
              message.method === 'initialize'
                ? { capabilities: {} }
                : [{ label: 'sin', kind: 3 }];
            const reply = frame({ jsonrpc: '2.0', id: message.id, result });
            // Exercise real framing across arbitrary stdout chunk boundaries.
            child.stdout.write(reply.subarray(0, 11));
            child.stdout.write(reply.subarray(11));
          }
        });
      }
      return child;
    });
    service = new PythonLanguageServerService(
      '/runtime/bin/python',
      '/runtime',
    );
  });

  afterEach(() => service.stop(true));

  it('uses one managed process for Python documents and returns completion responses', async () => {
    const sender = owner();
    const result = await service.request(
      {
        ...document,
        requestId: 'one',
        kind: 'completion',
        line: 1,
        character: 5,
      },
      sender,
    );
    expect(result).toEqual([{ label: 'sin', kind: 3 }]);
    await service.sync(
      { ...document, modelUri: document.modelUri.replace('cell-1', 'cell-2') },
      sender,
    );
    expect(spawn).toHaveBeenCalledTimes(2); // one package probe, one server
    expect(
      messages.filter((item) => item.method === 'textDocument/didOpen'),
    ).toHaveLength(2);
    const options = (spawn as jest.Mock).mock.calls[1][2];
    expect(options.shell).toBe(false);
    expect(Object.keys(options.env)).not.toContain('OPENAI_API_KEY');
    service.close(document.modelUri, sender);
    expect(messages.at(-1)?.method).toBe('textDocument/didClose');
  });

  it('rejects unsupported models and oversized text before starting a process', async () => {
    await expect(
      service.sync(
        { ...document, modelUri: 'file:///etc/private.py' },
        owner(),
      ),
    ).rejects.toThrow('Unsupported');
    await expect(
      service.sync({ ...document, text: 'x'.repeat(512 * 1024 + 1) }, owner()),
    ).rejects.toThrow('Invalid');
    await expect(
      service.sync(
        { ...document, modelUri: 'dbt-file://project/etc/private.py' },
        owner(),
      ),
    ).rejects.toThrow('outside');
    expect(LineageService.resolveProject).toHaveBeenCalledWith('project');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('cancels pending requests without stopping the server', async () => {
    const sender = owner();
    await service.sync(document, sender);
    replyToCompletions = false;
    const completion = service.request(
      {
        ...document,
        requestId: 'cancel-me',
        kind: 'completion',
        line: 1,
        character: 5,
      },
      sender,
    );
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    service.cancel('cancel-me', sender);
    expect(await completion).toBeNull();
    expect(messages.at(-1)?.method).toBe('$/cancelRequest');
    expect((await service.getStatus(sender)).state).toBe('ready');
  });

  it('ignores stale diagnostics and only sends current diagnostics to their owner', async () => {
    const sender = owner();
    const other = owner(2);
    await service.sync(document, sender);
    await service.getStatus(other);
    const uri = messages.find((item) => item.method === 'textDocument/didOpen')
      ?.params.textDocument.uri;
    const diagnostic = {
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
      message: 'Undefined name',
      severity: 1,
    };
    server.stdout.write(
      frame({
        method: 'textDocument/publishDiagnostics',
        params: { uri, version: 0, diagnostics: [diagnostic] },
      }),
    );
    expect(
      (sender.send as jest.Mock).mock.calls.filter(
        (call) => call[1].type === 'diagnostics',
      ),
    ).toHaveLength(0);
    server.stdout.write(
      frame({
        method: 'textDocument/publishDiagnostics',
        params: { uri, version: 1, diagnostics: [diagnostic] },
      }),
    );
    expect(sender.send).toHaveBeenCalledWith(
      'notebooks:python:lsp:event',
      expect.objectContaining({
        type: 'diagnostics',
        modelUri: document.modelUri,
      }),
    );
    expect(
      (other.send as jest.Mock).mock.calls.filter(
        (call) => call[1].type === 'diagnostics',
      ),
    ).toHaveLength(0);
  });

  it('clears diagnostics on maintenance and reopens documents after restart', async () => {
    const sender = owner();
    await service.sync(document, sender);
    const oldServer = server;
    service.stop(true);
    expect(oldServer.kill).toHaveBeenCalled();
    expect((await service.getStatus(sender)).state).toBe('needs-restart');
    expect(spawn).toHaveBeenCalledTimes(2);
    service.resume();
    expect((await service.getStatus(sender)).state).toBe('ready');
    expect(
      messages.filter((item) => item.method === 'textDocument/didOpen'),
    ).toHaveLength(2);
    // An old process exiting must not invalidate the new server.
    oldServer.emit('exit', 0);
    expect((await service.getStatus(sender)).state).toBe('ready');
  });
});
