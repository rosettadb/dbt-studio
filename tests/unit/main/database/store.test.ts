import fs from 'fs';
import os from 'os';
import path from 'path';
import { DatabaseStore } from '../../../../src/main/database/store';
import { CURRENT_SCHEMA_VERSION } from '../../../../src/main/database/migrations';

describe('DatabaseStore', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-store-test-'));
    dbPath = path.join(dir, 'database.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('initialization', () => {
    it('returns in-memory defaults without touching disk when the file does not exist yet', async () => {
      const store = new DatabaseStore(dbPath);

      const projects = await store.getField('projects');

      expect(projects).toEqual([]);
      expect(fs.existsSync(dbPath)).toBe(false);
    });

    it('creates the file (and schema-stamps it) on the first write', async () => {
      const store = new DatabaseStore(dbPath);

      await store.updateField('projects', () => [{ id: 'p1' } as never]);

      expect(fs.existsSync(dbPath)).toBe(true);
      const onDisk = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      expect(onDisk.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(onDisk.projects).toEqual([{ id: 'p1' }]);
    });

    it('creates its parent directory on the first write if it does not exist yet', async () => {
      const freshDir = path.join(dir, 'nested', 'profile-dir');
      const freshDbPath = path.join(freshDir, 'database.json');
      const store = new DatabaseStore(freshDbPath);

      await store.updateField('projects', () => [{ id: 'p1' } as never]);

      expect(fs.existsSync(freshDbPath)).toBe(true);
    });

    it('loads an existing up-to-date file as-is', async () => {
      fs.writeFileSync(
        dbPath,
        JSON.stringify({
          schemaVersion: CURRENT_SCHEMA_VERSION,
          projects: [{ id: 'p1', name: 'existing' }],
          settings: {},
          queries: {},
          connections: [],
          sources: [],
          recentItems: [],
        }),
      );

      const store = new DatabaseStore(dbPath);
      const projects = await store.getField('projects');

      expect(projects).toEqual([{ id: 'p1', name: 'existing' }]);
    });
  });

  describe('migration on load', () => {
    it('migrates a pre-versioning file, defaults missing fields, and backs up the original', async () => {
      const legacyContent = JSON.stringify({
        projects: [{ id: 'old-project' }],
      });
      fs.writeFileSync(dbPath, legacyContent);

      const store = new DatabaseStore(dbPath);
      const projects = await store.getField('projects');
      const recentItems = await store.getField('recentItems');

      expect(projects).toEqual([{ id: 'old-project' }]);
      expect(recentItems).toEqual([]);

      const onDisk = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      expect(onDisk.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

      const backupFiles = fs
        .readdirSync(dir)
        .filter((name) => name.includes('.v0.bak-'));
      expect(backupFiles).toHaveLength(1);
      expect(fs.readFileSync(path.join(dir, backupFiles[0]), 'utf8')).toBe(
        legacyContent,
      );
    });
  });

  describe('corruption recovery', () => {
    it('recovers from the most recent backup when the live file fails to parse', async () => {
      fs.writeFileSync(dbPath, '{ this is not valid json');
      const goodBackup = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        projects: [{ id: 'recovered-project' }],
        settings: {},
        queries: {},
        connections: [],
        sources: [],
        recentItems: [],
      };
      fs.writeFileSync(`${dbPath}.v1.bak-1000`, JSON.stringify(goodBackup));

      const store = new DatabaseStore(dbPath);
      const projects = await store.getField('projects');

      expect(projects).toEqual([{ id: 'recovered-project' }]);
    });

    it('picks the most recent backup when several exist', async () => {
      fs.writeFileSync(dbPath, '{ still not valid json');
      fs.writeFileSync(
        `${dbPath}.v1.bak-1000`,
        JSON.stringify({ projects: [{ id: 'older-backup' }] }),
      );
      fs.writeFileSync(
        `${dbPath}.v1.bak-2000`,
        JSON.stringify({ projects: [{ id: 'newer-backup' }] }),
      );

      const store = new DatabaseStore(dbPath);
      const projects = await store.getField('projects');

      expect(projects).toEqual([{ id: 'newer-backup' }]);
    });

    it('throws instead of silently wiping data when no valid backup exists', async () => {
      fs.writeFileSync(dbPath, '{ not valid json at all');

      const store = new DatabaseStore(dbPath);

      await expect(store.getField('projects')).rejects.toThrow(/corrupted/i);
    });
  });

  describe('updateField', () => {
    it('persists the new value and later reads observe it', async () => {
      const store = new DatabaseStore(dbPath);

      await store.updateField('recentItems', () => [{ id: 'a' } as never]);
      const recentItems = await store.getField('recentItems');

      expect(recentItems).toEqual([{ id: 'a' }]);
      const onDisk = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      expect(onDisk.recentItems).toEqual([{ id: 'a' }]);
    });

    it('does not lose updates when many concurrent callers touch the same key', async () => {
      const store = new DatabaseStore(dbPath);
      await store.getField('projects'); // warm the in-memory cache first

      const concurrentWrites = 25;
      await Promise.all(
        Array.from({ length: concurrentWrites }, (_, i) =>
          store.updateField('recentItems', (current) => [
            ...current,
            { id: `item-${i}` } as never,
          ]),
        ),
      );

      const recentItems = await store.getField('recentItems');
      expect(recentItems).toHaveLength(concurrentWrites);
      const ids = new Set(recentItems.map((item: any) => item.id));
      expect(ids.size).toBe(concurrentWrites);
    });

    it('applies concurrent updates to different keys without clobbering each other', async () => {
      const store = new DatabaseStore(dbPath);
      await store.getField('projects');

      await Promise.all([
        store.updateField('projects', () => [{ id: 'p1' } as never]),
        store.updateField('sources', () => [{ id: 's1' } as never]),
      ]);

      expect(await store.getField('projects')).toEqual([{ id: 'p1' }]);
      expect(await store.getField('sources')).toEqual([{ id: 's1' }]);
    });

    it('leaves the on-disk file untouched if the write fails partway through', async () => {
      const store = new DatabaseStore(dbPath);
      await store.updateField('recentItems', () => [{ id: 'before' } as never]);
      const beforeContent = fs.readFileSync(dbPath, 'utf8');

      const renameSpy = jest
        .spyOn(fs.promises, 'rename')
        .mockRejectedValueOnce(new Error('simulated disk failure'));

      await expect(
        store.updateField('recentItems', () => [{ id: 'after' } as never]),
      ).rejects.toThrow('simulated disk failure');

      renameSpy.mockRestore();

      expect(fs.readFileSync(dbPath, 'utf8')).toBe(beforeContent);
      expect(await store.getField('recentItems')).toEqual([{ id: 'before' }]);
    });
  });

  describe('transaction', () => {
    it('applies multiple key changes as a single atomic write', async () => {
      const store = new DatabaseStore(dbPath);
      await store.getField('projects');

      const writeSpy = jest.spyOn(fs.promises, 'rename');
      const callsBefore = writeSpy.mock.calls.length;

      const result = await store.transaction((db) => ({
        db: {
          ...db,
          projects: [{ id: 'p1' } as never],
          selectedProject: { id: 'p1' } as never,
        },
        result: 'done',
      }));

      expect(result).toBe('done');
      expect(writeSpy.mock.calls.length).toBe(callsBefore + 1);
      expect(await store.getField('projects')).toEqual([{ id: 'p1' }]);
      expect(await store.getField('selectedProject')).toEqual({ id: 'p1' });
    });
  });

  describe('getSnapshot', () => {
    it('reflects the latest write and combines fields consistently', async () => {
      const store = new DatabaseStore(dbPath);
      await store.updateField('projects', () => [{ id: 'p1' } as never]);
      await store.updateField('connections', () => [{ id: 'c1' } as never]);

      const snapshot = await store.getSnapshot();

      expect(snapshot.projects).toEqual([{ id: 'p1' }]);
      expect(snapshot.connections).toEqual([{ id: 'c1' }]);
    });
  });

  describe('invalidateCache', () => {
    it('forces the next access to re-read from disk', async () => {
      const store = new DatabaseStore(dbPath);
      await store.updateField('recentItems', () => [{ id: 'a' } as never]);

      // Simulate an external process rewriting the file (e.g. factory reset).
      fs.writeFileSync(
        dbPath,
        JSON.stringify({
          schemaVersion: CURRENT_SCHEMA_VERSION,
          projects: [],
          settings: {},
          queries: {},
          connections: [],
          sources: [],
          recentItems: [{ id: 'external-write' }],
        }),
      );

      store.invalidateCache();
      expect(await store.getField('recentItems')).toEqual([
        { id: 'external-write' },
      ]);
    });
  });
});
