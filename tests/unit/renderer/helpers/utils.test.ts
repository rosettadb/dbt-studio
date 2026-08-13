import {
  capitalizeFirstLetter,
  underscoreToTitleCase,
  format,
  extractSchemaAndTable,
  splitPath,
  getInitials,
  getRandomColor,
  convertToSourcePath,
  extractModelNameFromPath,
  getFileExtension,
  isEditableFile,
  getNonEditableFileMessage,
  compileCommand,
  generateFilename,
  getConnectionInput,
} from '../../../../src/renderer/helpers/utils';

jest.mock('../../../../src/renderer/services', () => {
  return {
    settingsServices: {
      usePathJoin: jest.fn(),
    },
  };
});

describe('renderer/helpers/utils', () => {
  describe('capitalizeFirstLetter', () => {
    it('should capitalize the first letter', () => {
      expect(capitalizeFirstLetter('hello')).toBe('Hello');
    });

    it('should return empty string for empty input', () => {
      expect(capitalizeFirstLetter('')).toBe('');
    });
  });

  describe('underscoreToTitleCase', () => {
    it('should convert underscores to title case', () => {
      expect(underscoreToTitleCase('hello_world')).toBe('Hello World');
    });

    it('should ignore empty segments', () => {
      expect(underscoreToTitleCase('__hello__WORLD__')).toBe('Hello World');
    });
  });

  describe('format', () => {
    it('should replace {} placeholders in order', () => {
      expect(format('Hello {}, {}!', 'World', 123)).toBe('Hello World, 123!');
    });
  });

  describe('extractSchemaAndTable', () => {
    it('should split schema and table at first underscore', () => {
      expect(extractSchemaAndTable('public_users')).toEqual({
        schema: 'public',
        table: 'users',
      });
    });

    it('should throw when underscore is missing', () => {
      expect(() => extractSchemaAndTable('users')).toThrow(
        'Filename must contain an underscore to separate schema and table',
      );
    });
  });

  describe('splitPath', () => {
    it('should strip project name prefix', () => {
      expect(splitPath('/Users/me/project/models/my.sql', 'project')).toBe(
        '/models/my.sql',
      );
    });

    it('should return original path if project name is not present', () => {
      expect(splitPath('/Users/me/other/models/my.sql', 'project')).toBe(
        '/Users/me/other/models/my.sql',
      );
    });
  });

  describe('getInitials', () => {
    it('should create initials from two words', () => {
      expect(getInitials('dbt studio')).toBe('DS');
    });

    it('should replace underscores with spaces', () => {
      expect(getInitials('dbt_studio')).toBe('DS');
    });

    it('should return single initial when only one word', () => {
      expect(getInitials('dbt')).toBe('D');
    });
  });

  describe('getRandomColor', () => {
    it('should be deterministic for same seed', () => {
      expect(getRandomColor('seed')).toBe(getRandomColor('seed'));
    });
  });

  describe('convertToSourcePath', () => {
    it('should convert underscore model name into source path', () => {
      expect(convertToSourcePath('/x/y/public_users.sql')).toBe(
        'source:public.users.sql',
      );
    });

    it('should fallback to whole name if no underscore', () => {
      expect(convertToSourcePath('/x/y/users.sql')).toBe('source:users.sql');
    });
  });

  describe('extractModelNameFromPath', () => {
    it('should convert models folder path to dot notation without extension', () => {
      expect(extractModelNameFromPath('/p/models/staging/my_model.sql')).toBe(
        'staging.my_model',
      );
    });

    it('should return empty string when models folder missing', () => {
      expect(extractModelNameFromPath('/p/staging/my_model.sql')).toBe('');
    });

    it('should handle Windows-style paths with backslashes', () => {
      expect(
        extractModelNameFromPath('C:\\p\\models\\staging\\my_model.sql'),
      ).toBe('staging.my_model');
    });
  });

  describe('getFileExtension / isEditableFile / getNonEditableFileMessage', () => {
    it('should return lowercase extension', () => {
      expect(getFileExtension('/x/Y/File.SQL')).toBe('.sql');
    });

    it('should treat duckdb as non-editable', () => {
      expect(isEditableFile('/x/main.duckdb')).toBe(false);
      expect(getNonEditableFileMessage('/x/main.duckdb')).toContain(
        'DuckDB Database File',
      );
    });

    it('should treat .sql as editable', () => {
      expect(isEditableFile('/x/model.sql')).toBe(true);
    });
  });

  describe('compileCommand', () => {
    it('should build a command using settingsServices.usePathJoin', async () => {
      const { settingsServices } = require('../../../../src/renderer/services');
      settingsServices.usePathJoin.mockResolvedValue('/tmp/project/rosetta');

      const project = {
        path: '/tmp/project',
        rosettaConnection: { name: 'conn' },
      } as any;
      const settings = { rosettaPath: '/bin/rosetta' };
      const command = {
        commandType: 'rosetta',
        command: 'run',
        arguments: new Map(),
      } as any;

      const result = await compileCommand(project, settings, command);

      expect(settingsServices.usePathJoin).toHaveBeenCalledWith(
        '/tmp/project',
        'rosetta',
      );
      expect(result).toContain('cd "/tmp/project/rosetta"');
      expect(result).toContain('"/bin/rosetta"');
      expect(result).toContain('run');
      expect(result).toContain('-s conn');
    });
  });

  describe('generateFilename', () => {
    it('should generate a deterministic prefix/extension shape', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2020-01-02T03:04:05Z'));

      const name = generateFilename('prefix', 'csv');

      expect(name).toMatch(/^prefix_\d{8}_\d{6}\.csv$/);

      jest.useRealTimers();
    });
  });

  describe('getConnectionInput', () => {
    it('maps SQLite connections for SQL Editor and Notebook loading', () => {
      expect(
        getConnectionInput({
          id: 'sqlite-connection',
          connection: {
            type: 'sqlite',
            name: 'SQLite Connection',
            database_path: '/tmp/analytics.sqlite',
            short_database_path: 'analytics.sqlite',
            database: '/tmp/analytics.sqlite',
            schema: 'main',
          },
        } as any),
      ).toEqual({
        type: 'sqlite',
        name: 'SQLite Connection',
        database_path: '/tmp/analytics.sqlite',
        database: '/tmp/analytics.sqlite',
        schema: 'main',
      });
    });
  });
});
