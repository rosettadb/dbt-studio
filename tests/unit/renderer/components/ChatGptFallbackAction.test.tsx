import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { AgentErrorAlert } from '../../../../src/renderer/components/chat/AgentErrorAlert';
import {
  useGetAIProviders,
  useSetActiveAIProvider,
} from '../../../../src/renderer/controllers/aiProviders.controller';

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock(
  '../../../../src/renderer/controllers/aiProviders.controller',
  () => ({
    useGetAIProviders: jest.fn(),
    useSetActiveAIProvider: jest.fn(),
  }),
);

const setActive = jest.fn();
const error = {
  type: 'chatgptUsageLimit' as const,
  title: 'ChatGPT Plan Limit Reached',
  body: 'Your ChatGPT plan limit is reached. It resets at 14:20.',
  raw: '',
};

describe('AgentErrorAlert: ChatGPT fallback (Plan 71, D7)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useSetActiveAIProvider as jest.Mock).mockReturnValue({
      mutate: setActive,
      isLoading: false,
    });
  });

  it('offers to switch to the OpenAI API-key provider', () => {
    (useGetAIProviders as jest.Mock).mockReturnValue({
      data: [
        { id: 1, name: 'ChatGPT', type: 'openai-codex' },
        { id: 2, name: 'Gemini', type: 'gemini' },
        { id: 3, name: 'Work OpenAI', type: 'openai' },
      ],
    });
    render(<AgentErrorAlert error={error} onDismiss={jest.fn()} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Switch to Work OpenAI' }),
    );
    expect(setActive).toHaveBeenCalledWith('3');
  });

  it('shows no switch button when ChatGPT is the only provider', () => {
    (useGetAIProviders as jest.Mock).mockReturnValue({
      data: [{ id: 1, name: 'ChatGPT', type: 'openai-codex' }],
    });
    render(<AgentErrorAlert error={error} onDismiss={jest.fn()} />);

    expect(screen.queryByRole('button', { name: /Switch to/ })).toBeNull();
    expect(screen.getByText('ChatGPT Plan Limit Reached')).toBeTruthy();
  });
});
