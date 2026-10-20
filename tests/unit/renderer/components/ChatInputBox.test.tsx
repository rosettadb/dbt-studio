import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { toast } from 'react-toastify';
import { ChatInputBox } from '../../../../src/renderer/components/chat/ChatInputBox';
import { selectChatImages } from '../../../../src/renderer/services/agent.service';
import {
  MAX_CHAT_IMAGES_PER_MESSAGE,
  type ChatImageAttachment,
} from '../../../../src/types/chatAttachments';

jest.mock('react-toastify', () => ({ toast: { error: jest.fn() } }));
jest.mock('../../../../src/renderer/services/agent.service', () => ({
  selectChatImages: jest.fn(),
  previewChatImage: jest.fn().mockResolvedValue({ dataUrl: '' }),
  releaseChatImages: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../../src/renderer/controllers/aiSettings.controller', () => ({
  useGetAISettings: () => ({ data: {} }),
}));
jest.mock(
  '../../../../src/renderer/controllers/aiProviders.controller',
  () => ({
    useGetAIProviders: () => ({ data: [] }),
    useGetActiveAIProvider: () => ({ data: null }),
    useSetActiveAIProvider: () => ({ mutate: jest.fn(), isLoading: false }),
  }),
);
jest.mock('../../../../src/renderer/hooks', () => ({
  useAppContext: () => ({ pendingMessage: null, setPendingMessage: jest.fn() }),
}));
jest.mock('../../../../src/renderer/hooks/useContextManager', () => ({
  useContextManager: () => ({ additionalFiles: [] }),
}));
jest.mock('../../../../src/renderer/hooks/useToolMode', () => ({
  useToolMode: () => ({
    isCodeMode: false,
    currentMode: 'chat',
    setToolMode: jest.fn(),
  }),
}));
jest.mock('../../../../src/renderer/hooks/useAutoRenameSession', () => ({
  useAutoRenameSession: () => ({ autoRename: jest.fn() }),
}));
jest.mock('../../../../src/renderer/components/chat/TipTapEditor', () => ({
  TipTapEditor: () => null,
}));
jest.mock('../../../../src/renderer/components/chat/FilePickerModal', () => ({
  FilePickerModal: () => null,
}));
jest.mock('../../../../src/renderer/components/chat/ContextTabs', () => ({
  ContextTabs: () => null,
}));
jest.mock('../../../../src/renderer/components/chat/ImageLightbox', () => ({
  ImageLightbox: () => null,
}));

const image: ChatImageAttachment = {
  id: 'image-1',
  conversationId: 1,
  messageId: null,
  name: 'existing.png',
  mediaType: 'image/png',
  byteSize: 100,
  width: 1,
  height: 1,
  createdAt: null,
};

const upload = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Add context...' }));
  const uploadItem = await screen.findByRole('menuitem', {
    name: 'Upload image',
  });
  await act(async () => {
    fireEvent.click(uploadItem);
  });
};

describe('ChatInputBox image selection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(selectChatImages).mockReset();
  });

  it.each([
    'Attach at most 3 more images.',
    'Images must be no larger than 5 MiB.',
    'Image dimensions exceed the 20 megapixel limit.',
    'Only PNG, JPEG, and WebP images are supported.',
  ])('shows a rejection and allows retry: %s', async (message) => {
    jest
      .mocked(selectChatImages)
      .mockResolvedValueOnce([image])
      .mockRejectedValueOnce(new Error(message))
      .mockResolvedValueOnce([{ ...image, id: 'image-2', name: 'retry.png' }]);
    render(<ChatInputBox sessionId={1} screenKey="sql" isStreaming={false} />);

    await upload();
    await screen.findByRole('button', { name: 'Remove existing.png' });
    await upload();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
    expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(1);

    await upload();
    await screen.findByRole('button', { name: 'Remove retry.png' });
    expect(selectChatImages).toHaveBeenLastCalledWith(1, 3);
    expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(2);
  });

  it('reports the limit when the composer is full without opening the picker', async () => {
    jest.mocked(selectChatImages).mockResolvedValueOnce(
      Array.from({ length: MAX_CHAT_IMAGES_PER_MESSAGE }, (_, index) => ({
        ...image,
        id: `image-${index}`,
        name: `image-${index}.png`,
      })),
    );
    render(<ChatInputBox sessionId={1} screenKey="sql" isStreaming={false} />);

    await upload();
    await screen.findByRole('button', { name: 'Remove image-3.png' });
    await upload();

    expect(toast.error).toHaveBeenCalledWith(
      'Attach at most 4 images per message.',
    );
    expect(selectChatImages).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(4);
  });

  it('keeps cancellation quiet and permits another selection', async () => {
    jest
      .mocked(selectChatImages)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([image]);
    render(<ChatInputBox sessionId={1} screenKey="sql" isStreaming={false} />);

    await upload();
    await waitFor(() => expect(selectChatImages).toHaveBeenCalledTimes(1));
    await upload();
    await screen.findByRole('button', { name: 'Remove existing.png' });
    expect(toast.error).not.toHaveBeenCalled();
  });
});
