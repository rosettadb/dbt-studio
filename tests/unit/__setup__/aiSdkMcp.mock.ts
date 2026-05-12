// Mock for @ai-sdk/mcp — ESM-only package that cannot be parsed by Jest in CommonJS mode
export const createMCPClient = jest.fn().mockResolvedValue({
  tools: jest.fn().mockResolvedValue({}),
  close: jest.fn().mockResolvedValue(undefined),
});
