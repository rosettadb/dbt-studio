import { chatService } from '../../../../src/renderer/services/chat.service';
import { client } from '../../../../src/renderer/config/client';

jest.mock('../../../../src/renderer/config/client', () => {
  return {
    client: {
      post: jest.fn(),
    },
  };
});

describe('renderer/services/chat.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getSessions should call client.post with chat:conversation:list and projectId filter', async () => {
    (client.post as jest.Mock).mockResolvedValue({ data: [{ id: 1 }] });

    const result = await chatService.getSessions(123);

    expect(client.post).toHaveBeenCalledWith('chat:conversation:list', {
      projectId: 123,
    });
    expect(result).toEqual([{ id: 1 }]);
  });

  it('getSessions should preserve string connectionId filters for SQL chat scoping', async () => {
    (client.post as jest.Mock).mockResolvedValue({ data: [{ id: 2 }] });

    const result = await chatService.getSessions({
      projectId: 123,
      screenKey: 'sql',
      connectionId: 'ducklake-instance-1',
    });

    expect(client.post).toHaveBeenCalledWith('chat:conversation:list', {
      projectId: 123,
      screenKey: 'sql',
      connectionId: 'ducklake-instance-1',
    });
    expect(result).toEqual([{ id: 2 }]);
  });

  it('getLatestCompactionSummary should request the latest persisted compaction cutoff', async () => {
    (client.post as jest.Mock).mockResolvedValue({
      data: {
        id: 7,
        conversationId: 123,
        content: 'summary',
        coversUpToMessageId: 42,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });

    const result = await chatService.getLatestCompactionSummary(123);

    expect(client.post).toHaveBeenCalledWith(
      'chat:conversation:get-latest-compaction-summary',
      123,
    );
    expect(result).toEqual({
      id: 7,
      conversationId: 123,
      content: 'summary',
      coversUpToMessageId: 42,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });
});
