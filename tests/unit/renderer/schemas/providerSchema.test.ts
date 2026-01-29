import { providerSchema } from '../../../../src/renderer/components/ai/CreateProviderDialog';

describe('providerSchema', () => {
  it('should accept a minimal valid provider', () => {
    const result = providerSchema.safeParse({
      name: 'My Provider',
      type: 'openai',
      apiKey: 'sk-test',
      baseUrl: '',
      model: '',
    });

    expect(result.success).toBe(true);
  });

  it('should reject missing name', () => {
    const result = providerSchema.safeParse({
      name: '',
      type: 'openai',
    });

    expect(result.success).toBe(false);
  });

  it('should reject invalid baseUrl', () => {
    const result = providerSchema.safeParse({
      name: 'X',
      type: 'openai',
      baseUrl: 'not-a-url',
    });

    expect(result.success).toBe(false);
  });
});
