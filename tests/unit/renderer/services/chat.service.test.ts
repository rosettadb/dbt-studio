import { chatService } from '../../../../src/renderer/services/chat.service';

jest.mock('../../../../src/renderer/config/client', () => {
  return {
    client: {
      post: jest.fn(),
    },
  };
});

describe('renderer/services/chat.service', () => {
  const { client } = require('../../../../src/renderer/config/client');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getSessions should call client.post with chat:conversation:list and projectId', async () => {
    client.post.mockResolvedValue({ data: [{ id: 1 }] });

    const result = await chatService.getSessions(123);

    expect(client.post).toHaveBeenCalledWith('chat:conversation:list', 123);
    expect(result).toEqual([{ id: 1 }]);
  });

  it('streamMessage should register chunk listener, call client.post, and unsubscribe', async () => {
    const onChunk = jest.fn();
    const unsubscribe = jest.fn();

    (window as any).electron.ipcRenderer.on = jest.fn().mockReturnValue(unsubscribe);

    client.post.mockResolvedValue({ data: { id: 10, content: 'done' } });

    const result = await chatService.streamMessage(7, 'hello', undefined, onChunk);

    expect((window as any).electron.ipcRenderer.on).toHaveBeenCalledWith(
      'chat:message:stream-chunk',
      expect.any(Function),
    );

    const handler = ((window as any).electron.ipcRenderer.on as jest.Mock).mock
      .calls[0][1] as (...args: unknown[]) => void;

    handler({ conversationId: 7, chunk: 'a', done: false });
    handler({ conversationId: 999, chunk: 'b', done: false });

    expect(onChunk).toHaveBeenCalledTimes(1);
    expect(onChunk).toHaveBeenCalledWith('a');

    expect(client.post).toHaveBeenCalledWith('chat:message:stream', {
      conversationId: 7,
      content: 'hello',
      contextItems: undefined,
    });

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: 10, content: 'done' });
  });
});
