import { act, renderHook, waitFor } from '@testing-library/react';

import { useChatGptSignIn } from '../../../../src/renderer/controllers/aiProviders.controller';
import { aiProvidersService } from '../../../../src/renderer/services/aiProviders.service';
import type { ChatGptAuthEventPayload } from '../../../../src/types/ipc';

jest.mock('../../../../src/renderer/services/aiProviders.service', () => ({
  aiProvidersService: {
    startChatGptAuth: jest.fn(),
    cancelChatGptAuth: jest.fn().mockResolvedValue(undefined),
    discardChatGptPendingLogin: jest.fn().mockResolvedValue(undefined),
    onChatGptAuthEvent: jest.fn(),
  },
}));

const service = aiProvidersService as jest.Mocked<typeof aiProvidersService>;

describe('useChatGptSignIn (Plan 71)', () => {
  let emit: (payload: ChatGptAuthEventPayload) => void;
  const unsubscribe = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    service.onChatGptAuthEvent.mockImplementation((listener) => {
      emit = listener;
      return unsubscribe;
    });
    // jsdom has no crypto.randomUUID (Electron's Chromium does).
    let n = 0;
    Object.defineProperty(window.crypto, 'randomUUID', {
      configurable: true,
      value: () => {
        n += 1;
        return `corr-${n}`;
      },
    });
  });

  it('signs in, follows events for its own attempt only, and exposes the login', async () => {
    let finish!: (value: unknown) => void;
    service.startChatGptAuth.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }) as any,
    );
    const { result } = renderHook(() => useChatGptSignIn());

    act(() => {
      result.current.start();
    });
    expect(service.startChatGptAuth).toHaveBeenCalledWith({
      correlationId: 'corr-1',
    });

    act(() => emit({ correlationId: 'other', status: 'failed', error: 'x' }));
    expect(result.current.status).toBe('started');

    act(() => emit({ correlationId: 'corr-1', status: 'waiting_for_browser' }));
    expect(result.current.status).toBe('waiting_for_browser');

    await act(async () => {
      finish({
        ok: true,
        loginId: 'L1',
        email: 'ada@example.com',
        planType: 'plus',
      });
    });
    expect(result.current.status).toBe('completed');
    expect(result.current.login).toEqual({
      loginId: 'L1',
      email: 'ada@example.com',
      planType: 'plus',
    });
  });

  it('cancel stops the running attempt', async () => {
    service.startChatGptAuth.mockReturnValue(new Promise(() => {}) as any);
    const { result } = renderHook(() => useChatGptSignIn());

    act(() => {
      result.current.start();
    });
    act(() => result.current.cancel());

    expect(service.cancelChatGptAuth).toHaveBeenCalledWith('corr-1');
    expect(result.current.status).toBe('cancelled');
  });

  it('shows the failure message from the main process', async () => {
    service.startChatGptAuth.mockResolvedValue({
      ok: false,
      message: 'Port 1455 is in use.',
    });
    const { result } = renderHook(() => useChatGptSignIn());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe('failed');
    expect(result.current.error).toBe('Port 1455 is in use.');
  });

  it('reset discards a pending login that was never saved', async () => {
    service.startChatGptAuth.mockResolvedValue({
      ok: true,
      loginId: 'L1',
      email: null,
      planType: null,
    });
    const { result } = renderHook(() => useChatGptSignIn());
    await act(async () => {
      await result.current.start();
    });

    act(() => result.current.reset());

    expect(service.discardChatGptPendingLogin).toHaveBeenCalledWith('L1');
    expect(result.current.login).toBeNull();
    expect(result.current.status).toBe('idle');
  });

  it('unsubscribes and cancels a running attempt on unmount', async () => {
    service.startChatGptAuth.mockReturnValue(new Promise(() => {}) as any);
    const { result, unmount } = renderHook(() => useChatGptSignIn());
    act(() => {
      result.current.start();
    });

    unmount();

    expect(unsubscribe).toHaveBeenCalled();
    await waitFor(() =>
      expect(service.cancelChatGptAuth).toHaveBeenCalledWith('corr-1'),
    );
  });
});
