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

function toShape(rawInput: unknown): RawShape {
  return typeof rawInput === 'object' && rawInput !== null
    ? (rawInput as RawShape)
    : {};
}

// Fills in safe defaults for every field this build reads/writes.
// `preserveUnknownKeys` controls whether fields this build doesn't
// recognize are kept (spread in) or dropped — migrate() drops them
// because it's reconstructing a known-old shape into the current one;
// passthroughNewerVersion() keeps them because it has no business
// deleting fields a *newer* build understands and this one doesn't.
function withSafeDefaults(
  shape: RawShape,
  schemaVersion: number,
  preserveUnknownKeys: boolean,
): DataBase {
  return {
    ...(preserveUnknownKeys ? shape : {}),
    schemaVersion,
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
  } as DataBase;
}

/**
 * Runs every pending migration in order and defensively fills in any field
 * still missing afterwards (covers installs older than the oldest
 * migration, and callers that hand in a bare `{}`). Never throws on a
 * merely-incomplete shape — only a genuinely corrupt/unparseable file
 * should reach the store's recovery path instead of this function.
 */
export function migrate(rawInput: unknown): DataBase {
  let shape = toShape(rawInput);

  const startVersion = shape.schemaVersion ?? 0;
  pendingMigrations(startVersion).forEach((m) => {
    shape = m.migrate(shape);
  });

  return withSafeDefaults(shape, CURRENT_SCHEMA_VERSION, false);
}

/**
 * For a file written by a newer build than this one (e.g. after a
 * downgrade): unlike migrate(), never reconstructs the object from a fixed
 * key whitelist — any top-level field this build doesn't recognize
 * survives untouched, and the recorded schemaVersion is left as whatever
 * the newer build wrote. This build only acts on the fields it knows;
 * anything it doesn't stays intact so an eventual re-upgrade loses nothing.
 */
export function passthroughNewerVersion(rawInput: unknown): DataBase {
  const shape = toShape(rawInput);
  return withSafeDefaults(
    shape,
    shape.schemaVersion ?? CURRENT_SCHEMA_VERSION,
    true,
  );
}
