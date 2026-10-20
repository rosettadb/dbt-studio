import { getContextWindow } from '../../../../../src/main/services/ai/tokenEstimator';
import {
  CHATGPT_INPUT_TOKEN_LIMIT,
  CHATGPT_PROVIDER_ID,
} from '../../../../../src/main/services/ai/chatgpt/chatgptModels';

describe('getContextWindow', () => {
  it('applies ChatGPT caps only to the ChatGPT model', () => {
    expect(getContextWindow('gpt-5.4', CHATGPT_PROVIDER_ID)).toBe(
      CHATGPT_INPUT_TOKEN_LIMIT,
    );
    expect(getContextWindow('unknown-model', CHATGPT_PROVIDER_ID)).toBe(
      CHATGPT_INPUT_TOKEN_LIMIT,
    );
  });

  it('keeps API-key context windows after a ChatGPT lookup', () => {
    getContextWindow('gpt-5.4', CHATGPT_PROVIDER_ID);
    expect(getContextWindow('gpt-5.4', 'openai.responses')).toBe(1_000_000);
  });
});
