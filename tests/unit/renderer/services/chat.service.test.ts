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
});
