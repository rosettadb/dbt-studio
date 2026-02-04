import { instanceEditSchema } from '../../../../src/renderer/components/dataLake/DataLakeInstanceEditForm';

describe('instanceEditSchema', () => {
  it('should accept a valid payload', () => {
    const result = instanceEditSchema.safeParse({
      name: 'My Instance',
      description: '',
      runtime: { enableOptimizer: true, threads: 4, maxMemory: '4GB' },
    });

    expect(result.success).toBe(true);
  });

  it('should reject missing name', () => {
    const result = instanceEditSchema.safeParse({
      name: '',
      runtime: { enableOptimizer: true },
    });

    expect(result.success).toBe(false);
  });
});
