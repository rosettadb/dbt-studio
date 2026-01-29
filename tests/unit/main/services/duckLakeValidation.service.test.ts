import DuckLakeValidationService from '../../../../src/main/services/duckLake/validation.service';
import { DuckLakeError } from '../../../../src/types/duckLakeErrors';

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  statSync: jest.fn(),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

import fs from 'fs';

describe('DuckLakeValidationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateCreateRequest', () => {
    const validBaseRequest = () =>
      ({
        name: 'valid_name',
        dataPath: '/tmp/data',
        catalog: {
          type: 'duckdb',
          duckdb: { metadataPath: '/tmp/meta.db' },
        },
      }) as any;

    it('throws when instance name is missing', () => {
      const req = validBaseRequest();
      req.name = '';

      expect(() => DuckLakeValidationService.validateCreateRequest(req)).toThrow(
        'name: Instance name is required',
      );
    });

    it('throws when instance name contains invalid characters', () => {
      const req = validBaseRequest();
      req.name = 'bad name';

      expect(() => DuckLakeValidationService.validateCreateRequest(req)).toThrow(
        'name: Instance name can only contain letters, numbers, hyphens, and underscores',
      );
    });

    it('throws when dataPath is not absolute and not a cloud URI', () => {
      const req = validBaseRequest();
      req.dataPath = 'relative/path';

      expect(() => DuckLakeValidationService.validateCreateRequest(req)).toThrow(
        'dataPath: Data path must be an absolute path or a valid cloud URI',
      );
    });
  });

  describe('validateUpdateRequest', () => {
    it('throws when name is provided but empty', () => {
      expect(() =>
        DuckLakeValidationService.validateUpdateRequest({ name: '' } as any),
      ).toThrow('name: Instance name cannot be empty');
    });

    it('throws when dataPath is provided but invalid', () => {
      expect(() =>
        DuckLakeValidationService.validateUpdateRequest({ dataPath: 'x' } as any),
      ).toThrow('dataPath: Data path must be an absolute path or a valid cloud URI');
    });
  });

  describe('validateDataPathAccess', () => {
    it('skips filesystem checks for cloud paths', async () => {
      await expect(
        DuckLakeValidationService.validateDataPathAccess('s3://bucket/prefix'),
      ).resolves.toBeUndefined();

      expect((fs.existsSync as jest.Mock).mock.calls.length).toBe(0);
    });

    it('throws a validation error when directory creation fails', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (fs.mkdirSync as jest.Mock).mockImplementation(() => {
        throw new Error('EACCES');
      });

      await expect(
        DuckLakeValidationService.validateDataPathAccess('/tmp/data'),
      ).rejects.toBeInstanceOf(DuckLakeError);

      await expect(
        DuckLakeValidationService.validateDataPathAccess('/tmp/data'),
      ).rejects.toThrow('dataPath: Cannot create data path: EACCES');
    });

    it('throws when path is not a directory', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });

      await expect(
        DuckLakeValidationService.validateDataPathAccess('/tmp/data'),
      ).rejects.toThrow('dataPath: Data path must be a directory');
    });
  });
});
