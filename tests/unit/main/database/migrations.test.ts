import {
  CURRENT_SCHEMA_VERSION,
  migrate,
  pendingMigrations,
} from '../../../../src/main/database/migrations';

describe('migrations', () => {
  describe('migrate', () => {
    it('fills in every field with a safe default from an empty object', () => {
      const result = migrate({});

      expect(result).toEqual({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        projects: [],
        settings: {},
        selectedProject: undefined,
        queries: {},
        savedQueries: undefined,
        connections: [],
        sources: [],
        recentItems: [],
        icebergInstances: undefined,
      });
    });

    it('treats non-object input (e.g. a corrupt-but-parseable value) the same as empty', () => {
      expect(migrate(null).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(migrate(42).projects).toEqual([]);
      expect(migrate('oops').connections).toEqual([]);
    });

    it('stamps a pre-versioning (implicit version 0) shape without touching its data', () => {
      const legacy = {
        projects: [{ id: '1', name: 'demo' }],
        connections: [{ id: 'c1' }],
      };

      const result = migrate(legacy);

      expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(result.projects).toEqual(legacy.projects);
      expect(result.connections).toEqual(legacy.connections);
      // Fields absent from the legacy file still get their defaults.
      expect(result.recentItems).toEqual([]);
      expect(result.sources).toEqual([]);
    });

    it('is a no-op on data that is already at the current version', () => {
      const current = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        projects: [{ id: '1' }],
        settings: { isSetup: 'true' },
        queries: {},
        connections: [],
        sources: [],
        recentItems: [],
      };

      const result = migrate(current);

      expect(result).toEqual(current);
    });
  });

  describe('pendingMigrations', () => {
    it('returns every migration above the given version, in ascending order', () => {
      const pending = pendingMigrations(0);
      expect(pending.map((m) => m.version)).toEqual(
        [...pending.map((m) => m.version)].sort((a, b) => a - b),
      );
      expect(pending.every((m) => m.version > 0)).toBe(true);
    });

    it('returns nothing once already at the current version', () => {
      expect(pendingMigrations(CURRENT_SCHEMA_VERSION)).toEqual([]);
    });
  });
});
