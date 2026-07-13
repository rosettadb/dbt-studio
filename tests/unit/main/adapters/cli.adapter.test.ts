import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import CliAdapter from '../../../../src/main/adapters/cli.adapter';

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

const mockedSpawn = spawn as jest.MockedFunction<typeof spawn>;

describe('CliAdapter environment', () => {
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
});
