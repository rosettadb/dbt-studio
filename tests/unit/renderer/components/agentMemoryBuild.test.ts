import type { QueryClient } from 'react-query';
import { toast } from 'react-toastify';
import { buildAgentMemoryInBackground } from '../../../../src/renderer/components/chat/agentMemoryBuild';
import { resetSecondBrainQueriesAfterDelete } from '../../../../src/renderer/controllers/secondBrain.controller';
import {
  loadAISettings,
  saveAISettings,
} from '../../../../src/renderer/services/agent.service';
import { initialize } from '../../../../src/renderer/services/secondBrain.service';

jest.mock('react-toastify', () => ({
  toast: {
    dismiss: jest.fn(),
    info: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock(
  '../../../../src/renderer/controllers/secondBrain.controller',
  () => ({
    SECOND_BRAIN_KEYS: { all: ['second-brain'] },
    resetSecondBrainQueriesAfterDelete: jest.fn().mockResolvedValue(undefined),
  }),
);
jest.mock('../../../../src/renderer/services/agent.service', () => ({
  loadAISettings: jest.fn(),
  saveAISettings: jest.fn(),
}));
jest.mock('../../../../src/renderer/services/secondBrain.service', () => ({
  initialize: jest.fn(),
}));

const runBuild = () => {
  const queryClient = {
    invalidateQueries: jest.fn().mockResolvedValue(undefined),
  };
  const done = buildAgentMemoryInBackground({
    queryClient: queryClient as unknown as QueryClient,
    openAgentMemorySettings: jest.fn(),
  });
  return { queryClient, done };
};

describe('buildAgentMemoryInBackground', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (loadAISettings as jest.Mock).mockResolvedValue({
      secondBrain: { enabled: true, initialized: false },
    });
    (saveAISettings as jest.Mock).mockResolvedValue(undefined);
  });

  it('leaves memory on when a build is already running', async () => {
    (initialize as jest.Mock).mockRejectedValue(
      Object.assign(new Error('Another operation is already running.'), {
        code: 'BUSY',
      }),
    );

    const { queryClient, done } = runBuild();
    await done;

    expect(saveAISettings).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(resetSecondBrainQueriesAfterDelete).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith([
      'second-brain',
    ]);
  });

  it('turns memory off and reports other setup failures', async () => {
    (initialize as jest.Mock).mockRejectedValue(new Error('Provider failed.'));

    const { done } = runBuild();
    await done;

    expect(saveAISettings).toHaveBeenCalledWith({
      secondBrain: { enabled: false, initialized: false },
    });
    expect(toast.error).toHaveBeenCalled();
    expect(resetSecondBrainQueriesAfterDelete).toHaveBeenCalled();
  });
});
