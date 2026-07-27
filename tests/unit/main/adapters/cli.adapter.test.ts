import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import CliAdapter from '../../../../src/main/adapters/cli.adapter';

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

const mockedSpawn = spawn as jest.MockedFunction<typeof spawn>;

describe('CliAdapter environment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes only the approved experimental-adapter flag to the child', async () => {
    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    mockedSpawn.mockReturnValue(child);

    const adapter = new CliAdapter();
    const command = adapter.runCommandWithoutStreaming(
      '/managed/dbt',
      ['run'],
      {
        DBT_ALLOW_EXPERIMENTAL_ADAPTERS: 'true',
        MALICIOUS_EXTRA_KEY: 'blocked',
      } as any,
    );

    expect(mockedSpawn).toHaveBeenCalledWith(
      '/managed/dbt',
      ['run'],
      expect.objectContaining({
        shell: false,
        env: expect.objectContaining({
          DBT_ALLOW_EXPERIMENTAL_ADAPTERS: 'true',
        }),
      }),
    );
    const spawnOptions = mockedSpawn.mock.calls[0][2] as any;
    expect(spawnOptions.env.MALICIOUS_EXTRA_KEY).toBeUndefined();

    child.emit('close', 0);
    await expect(command).resolves.toBeUndefined();
  });

  it('publishes a nonzero exit code before completing the command', async () => {
    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    mockedSpawn.mockReturnValue(child);
    const send = jest.fn();
    const adapter = new CliAdapter();

    const command = adapter.runCommand(
      { webContents: { send } } as any,
      '/managed/dbt',
      ['run'],
    );
    const rejected = command.catch((error) => error as Error);

    child.emit('close', 139);
    expect(((await rejected) as Error).message).toBe(
      'Process exited with error code 139',
    );

    expect(send).toHaveBeenCalledWith(
      'cli:error',
      'Process exited with code 139',
    );
    expect(send).toHaveBeenCalledWith('cli:done', 139);
    const errorCall = send.mock.calls.findIndex(
      ([channel]) => channel === 'cli:error',
    );
    const doneCall = send.mock.calls.findIndex(
      ([channel]) => channel === 'cli:done',
    );
    expect(errorCall).toBeLessThan(doneCall);
  });
});
