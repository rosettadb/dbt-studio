import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import SettingsService from '../../../../../src/main/services/settings.service';
import { executeDbtCommand } from '../../../../../src/main/services/ai/tools/dbt.tools';

jest.mock('child_process', () => ({
  spawn: jest.fn(),
  exec: jest.fn(),
  execFileSync: jest.fn(),
}));
jest.mock('../../../../../src/main/services/settings.service', () => ({
  __esModule: true,
  default: { getDbtExePath: jest.fn() },
}));
jest.mock('../../../../../src/main/services/dbtCoreVersion.service', () => ({
  DbtCoreVersionService: {
    checkProjectAdapterCompatibility: jest.fn().mockResolvedValue({
      adapter: { canExecute: true },
    }),
  },
}));
jest.mock('../../../../../src/main/services/agent.service', () => ({
  __esModule: true,
  default: {
    currentAgentContext: null,
    getAgentContext: jest.fn(),
  },
}));

const spawnMock = spawn as jest.MockedFunction<typeof spawn>;
const getDbtExePathMock = SettingsService.getDbtExePath as jest.MockedFunction<
  typeof SettingsService.getDbtExePath
>;

describe('executeDbtCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getDbtExePathMock.mockResolvedValue('/managed/dbt');
  });

  it('returns a failed envelope with output and exit code', async () => {
    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    spawnMock.mockImplementation(() => {
      queueMicrotask(() => {
        child.stdout.emit('data', Buffer.from('Summary: 8 total | 4 error\n'));
        child.emit('close', 1);
      });
      return child;
    });

    const command = executeDbtCommand({
      command: 'run',
      projectPath: '/project',
      toolName: 'studio_cli_run_dbt',
      requireApproval: false,
    });

    await expect(command).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        exitCode: 1,
        error: 'Command failed with code 1',
        output: expect.stringContaining('4 error'),
      }),
    );
  });
});
