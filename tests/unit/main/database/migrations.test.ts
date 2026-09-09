import {
  CURRENT_SCHEMA_VERSION,
  migrate,
  passthroughNewerVersion,
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

  describe('passthroughNewerVersion', () => {
    it('preserves fields this build does not recognize instead of dropping them', () => {
      const fromNewerBuild = {
        schemaVersion: CURRENT_SCHEMA_VERSION + 1,
        projects: [{ id: '1' }],
        settings: {},
        queries: {},
        connections: [],
        sources: [],
        recentItems: [],
        // A field only the newer build understands.
        futureFeatureConfig: { enabled: true },
      };

      const result = passthroughNewerVersion(
        fromNewerBuild,
      ) as unknown as typeof fromNewerBuild;

      expect(result.futureFeatureConfig).toEqual({ enabled: true });
      expect(result.projects).toEqual(fromNewerBuild.projects);
    });

    it('does not down-stamp schemaVersion to the current build version', () => {
      const fromNewerBuild = { schemaVersion: CURRENT_SCHEMA_VERSION + 5 };

      const result = passthroughNewerVersion(fromNewerBuild);

      expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION + 5);
    });

    it('still fills in safe defaults for known fields that are missing', () => {
      const result = passthroughNewerVersion({
        schemaVersion: CURRENT_SCHEMA_VERSION + 1,
      });

      expect(result.projects).toEqual([]);
      expect(result.connections).toEqual([]);
      expect(result.recentItems).toEqual([]);
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
