import { DataBase } from '../../types/backend';

// Bump this whenever a migration is added below. Every database.json ever
// written before this system existed has no `schemaVersion` field at all,
// so it is treated as version 0.
export const CURRENT_SCHEMA_VERSION = 1;

type RawShape = Record<string, unknown> & { schemaVersion?: number };

interface Migration {
  // The version this migration produces, i.e. it runs for any file whose
  // recorded version is lower than this number.
  version: number;
  migrate: (raw: RawShape) => RawShape;
}

// Ordered by version, ascending. Each entry transforms the *previous*
// shape into this version's shape. Keep old migrations forever — they are
// what let an install from years ago open successfully today.
const migrations: Migration[] = [
  {
    // No structural change: this just stamps every pre-versioning file
    // (implicit version 0) so it — and every future file — carries an
    // explicit, auditable schema version from here on.
    version: 1,
    migrate: (raw) => ({ ...raw, schemaVersion: 1 }),
  },
];

export function pendingMigrations(fromVersion: number): Migration[] {
  return migrations
    .filter((m) => m.version > fromVersion)
    .sort((a, b) => a.version - b.version);
}

/**
 * Runs every pending migration in order and defensively fills in any field
 * still missing afterwards (covers installs older than the oldest
 * migration, and callers that hand in a bare `{}`). Never throws on a
 * merely-incomplete shape — only a genuinely corrupt/unparseable file
 * should reach the store's recovery path instead of this function.
 */
export function migrate(rawInput: unknown): DataBase {
  let shape: RawShape =
    typeof rawInput === 'object' && rawInput !== null
      ? (rawInput as RawShape)
      : {};

  const startVersion = shape.schemaVersion ?? 0;
  pendingMigrations(startVersion).forEach((m) => {
    shape = m.migrate(shape);
  });

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    projects: (shape.projects as DataBase['projects']) ?? [],
    settings:
      (shape.settings as DataBase['settings']) ?? ({} as DataBase['settings']),
    selectedProject: shape.selectedProject as DataBase['selectedProject'],
    queries: (shape.queries as DataBase['queries']) ?? {},
    savedQueries: shape.savedQueries as DataBase['savedQueries'],
    connections: (shape.connections as DataBase['connections']) ?? [],
    sources: (shape.sources as DataBase['sources']) ?? [],
    recentItems: (shape.recentItems as DataBase['recentItems']) ?? [],
    icebergInstances: shape.icebergInstances as DataBase['icebergInstances'],
  };
}
