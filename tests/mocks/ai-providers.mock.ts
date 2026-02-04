export const mockOpenAI = {
  responses: {
    create: jest.fn(),
  },
};

export const mockAnthropic = {
  messages: {
    create: jest.fn(),
  },
};

export const mockGemini = {
  generateContent: jest.fn(),
};
