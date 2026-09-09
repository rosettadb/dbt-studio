import fs from 'fs';
import path from 'path';
import { DataBase } from '../../types/backend';
import { CURRENT_SCHEMA_VERSION, migrate } from './migrations';

function defaultDatabase(): DataBase {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    projects: [],
    settings: {} as DataBase['settings'],
    queries: {},
    connections: [],
    sources: [],
    recentItems: [],
  };
}

/**
 * Single point of read/write access to a JSON-file-backed database
 * (production: database.json). Replaces the old pattern of independent
 * `fs.readFile` + in-memory mutation + `fs.writeFile` call sites, which was
 * racy: two concurrent callers could both read the same stale value before
 * either wrote back, silently dropping one of their changes.
 *
 * All access — reads included — goes through a single serialized queue, so
 * a `getField` always observes the latest committed write and a
 * `updateField`/`transaction` always mutates the true current value rather
 * than a snapshot taken before it got in line.
 */
export class DatabaseStore {
  private readonly filePath: string;

  private cache: DataBase | null = null;

  private queue: Promise<unknown> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  /** Drops the in-memory cache so the next access re-reads from disk. */
  invalidateCache(): void {
    this.cache = null;
  }

  async getField<K extends keyof DataBase>(key: K): Promise<DataBase[K]> {
    return this.enqueue(async () => {
      const db = await this.ensureLoaded();
      return db[key];
    });
  }

  /**
   * Reads multiple fields as one consistent snapshot — use this instead of
   * separate getField calls whenever a caller combines two or more fields
   * (e.g. joining projects to connections), since two separate getField
   * calls are two separate queue turns and a write could land in between.
   */
  async getSnapshot(): Promise<Readonly<DataBase>> {
    return this.enqueue(async () => this.ensureLoaded());
  }

  async updateField<K extends keyof DataBase>(
    key: K,
    updater: (current: DataBase[K]) => DataBase[K],
  ): Promise<DataBase[K]> {
    return this.enqueue(async () => {
      const db = await this.ensureLoaded();
      const next = updater(db[key]);
      const updatedDb: DataBase = { ...db, [key]: next };
      await this.persist(updatedDb);
      this.cache = updatedDb;
      return next;
    });
  }

  /**
   * For updates that must touch more than one top-level key atomically
   * (e.g. updating `selectedProject` and `projects` together) — one lock
   * hold, one disk write, instead of two independent updateField calls
   * that could otherwise interleave with someone else's write in between.
   */
  async transaction<T>(
    mutator: (db: DataBase) => { db: DataBase; result: T },
  ): Promise<T> {
    return this.enqueue(async () => {
      const db = await this.ensureLoaded();
      const { db: nextDb, result } = mutator(db);
      await this.persist(nextDb);
      this.cache = nextDb;
      return result;
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    // Keep the chain alive regardless of this operation's outcome so one
    // failed read/write never permanently jams every later caller.
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async ensureLoaded(): Promise<DataBase> {
    if (!this.cache) {
      this.cache = await this.loadFromDisk();
    }
    return this.cache;
  }

  private async loadFromDisk(): Promise<DataBase> {
    let raw: string;
    try {
      raw = await fs.promises.readFile(this.filePath, 'utf8');
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === 'ENOENT') {
        // Don't write anything on a mere read of a not-yet-existing
        // profile — the file is created naturally by the first real
        // write (updateField/transaction), same as before this store
        // existed. Avoids surprising disk writes on read-only access.
        return defaultDatabase();
      }
      throw err;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (parseError) {
      return this.recoverFromBackup(parseError as Error);
    }

    const onDiskVersion =
      (parsed as { schemaVersion?: number })?.schemaVersion ?? 0;
    const needsMigration = onDiskVersion < CURRENT_SCHEMA_VERSION;
    if (needsMigration) {
      await this.backup(raw, onDiskVersion);
    }
    const migrated = migrate(parsed);
    if (needsMigration) {
      await this.persist(migrated);
    }
    return migrated;
  }

  private backupPath(fromVersion: number): string {
    return `${this.filePath}.v${fromVersion}.bak-${Date.now()}`;
  }

  private async backup(raw: string, fromVersion: number): Promise<void> {
    await fs.promises.writeFile(this.backupPath(fromVersion), raw, 'utf8');
  }

  /**
   * A file that fails to JSON.parse is corruption, not "no file" — treating
   * it as an empty install (the old loadDatabaseFile behavior) would
   * silently destroy every project/connection/setting the user has. Try
   * the most recent pre-migration backup instead; only give up and throw
   * if none parses either.
   */
  private async recoverFromBackup(parseError: Error): Promise<DataBase> {
    const dir = path.dirname(this.filePath);
    const base = path.basename(this.filePath);
    let entries: string[] = [];
    try {
      entries = await fs.promises.readdir(dir);
    } catch {
      // fall through to the "no backup" error below
    }

    const backups = entries
      .filter((name) => name.startsWith(`${base}.v`) && name.includes('.bak-'))
      .sort()
      .reverse();

    // eslint-disable-next-line no-restricted-syntax
    for (const backupName of backups) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const backupRaw = await fs.promises.readFile(
          path.join(dir, backupName),
          'utf8',
        );
        const parsed = JSON.parse(backupRaw);
        // eslint-disable-next-line no-console
        console.error(
          `[DatabaseStore] ${this.filePath} is corrupted (${parseError.message}); recovered from backup ${backupName}`,
        );
        return migrate(parsed);
      } catch {
        // Try the next-oldest backup.
      }
    }

    throw new Error(
      `${this.filePath} is corrupted and no valid backup could be recovered: ${parseError.message}`,
    );
  }

  /** Atomic write: stage in a temp file, fsync, then rename over the real
   * path. A crash or failed write mid-way leaves the previous file intact
   * instead of a truncated/corrupted one. */
  private async persist(data: DataBase): Promise<void> {
    const dir = path.dirname(this.filePath);
    // Don't assume some other init step already created the directory —
    // the store should be self-sufficient on a completely fresh profile.
    await fs.promises.mkdir(dir, { recursive: true });
    const tmpPath = path.join(
      dir,
      `.${path.basename(this.filePath)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    const handle = await fs.promises.open(tmpPath, 'w');
    try {
      await handle.writeFile(JSON.stringify(data, null, 2), 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.promises.rename(tmpPath, this.filePath);
  }
}
