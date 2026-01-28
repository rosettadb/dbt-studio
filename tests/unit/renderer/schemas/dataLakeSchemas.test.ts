import {
  catalogConfigSchema,
  instanceBasicsSchema,
  runtimeOptionsSchema,
  storageConfigSchema,
} from '../../../../src/renderer/components/dataLake/DataLakeConnectionWizard';

describe('DataLakeConnectionWizard schemas', () => {
  describe('instanceBasicsSchema', () => {
    it('should require name', () => {
      expect(instanceBasicsSchema.safeParse({}).success).toBe(false);
      expect(instanceBasicsSchema.safeParse({ name: 'x' }).success).toBe(true);
    });
  });

  describe('storageConfigSchema', () => {
    it('should accept local config with path', () => {
      const result = storageConfigSchema.safeParse({
        type: 'local',
        local: { path: '/tmp' },
      });

      expect(result.success).toBe(true);
    });

    it('should accept connectionId flow requiring bucket', () => {
      const result = storageConfigSchema.safeParse({
        type: 's3',
        connectionId: 'abc',
        bucket: 'my-bucket',
      });

      expect(result.success).toBe(true);
    });

    it('should reject missing required fields', () => {
      const result = storageConfigSchema.safeParse({ type: 'local' });
      expect(result.success).toBe(false);
    });
  });

  describe('catalogConfigSchema', () => {
    it('should accept duckdb with .duckdb path', () => {
      const result = catalogConfigSchema.safeParse({
        type: 'duckdb',
        duckdb: { metadataPath: '/tmp/meta.duckdb' },
      });

      expect(result.success).toBe(true);
    });

    it('should reject duckdb with wrong extension', () => {
      const result = catalogConfigSchema.safeParse({
        type: 'duckdb',
        duckdb: { metadataPath: '/tmp/meta.txt' },
      });

      expect(result.success).toBe(false);
    });
  });

  describe('runtimeOptionsSchema', () => {
    it('should validate threads bounds', () => {
      expect(
        runtimeOptionsSchema.safeParse({ enableOptimizer: true, threads: 0 })
          .success,
      ).toBe(false);
      expect(
        runtimeOptionsSchema.safeParse({ enableOptimizer: true, threads: 4 })
          .success,
      ).toBe(true);
    });
  });
});
