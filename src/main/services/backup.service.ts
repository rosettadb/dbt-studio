/* eslint-disable no-restricted-syntax, no-await-in-loop */
/**
 * BackupService
 * Handles export and import of app data as a ZIP archive.
 *
 * Categories:
 *  - projects     → project metadata entries from db.json (not the on-disk dbt dirs)
 *  - connections  → connection model entries from db.json
 *  - sources      → cloud source entries from db.json
 *  - notebooks    → JSON files from {userData}/notebooks/
 *  - settings     → settings object from db.json
 *  - secretStore  → all keytar credentials (requires password to encrypt)
 *
 * The ZIP manifest (backup-manifest.json) records which categories were
 * included so that the importer can safely skip unknown sections.
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import { app } from 'electron';
import AdmZip from 'adm-zip';
import archiver from 'archiver';
import { loadDatabaseFile, updateDatabase } from '../utils/fileHelper';
import SecureStorageService from './secureStorage.service';
import MainDatabaseService from './mainDatabase.service';

// Register the encrypted zip format
archiver.registerFormat('zip-encrypted', require('archiver-zip-encrypted'));

// ─── Types ────────────────────────────────────────────────────────────────────

export type BackupCategory =
  | 'projects'
  | 'connections'
  | 'datalake'
  | 'sources'
  | 'notebooks'
  | 'settings'
  | 'secretStore'
  | 'savedQueries'
  | 'analytics'
  | 'aiProviders';

export interface BackupExportRequest {
  categories: BackupCategory[];
  /** Required when 'secretStore' is in categories */
  password?: string;
  /** Absolute path for the output .zip file */
  outputPath: string;
  /** Called at each export step for progress reporting */
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}

export interface BackupImportRequest {
  /** Absolute path of the .zip file to import */
  filePath: string;
  /** Required when the backup contains an encrypted secretStore entry */
  password?: string;
  /** Called at each import step for progress reporting */
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}

export interface BackupManifest {
  version: 1;
  createdAt: string;
  appVersion: string;
  categories: BackupCategory[];
  hasEncryptedSecretStore: boolean;
}

export interface BackupImportResult {
  imported: Partial<Record<BackupCategory, number>>;
  skipped: string[];
  warnings: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MANIFEST_ENTRY = 'backup-manifest.json';
const DB_SNAPSHOT_ENTRY = 'db-snapshot.json';
const NOTEBOOKS_PREFIX = 'notebooks/';
const SECRET_STORE_ENTRY = 'keystore.json';
const NOTEBOOKS_DIR = path.join(app.getPath('userData'), 'notebooks');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const readNotebookFiles = async (): Promise<
  { name: string; content: string }[]
> => {
  if (!fs.existsSync(NOTEBOOKS_DIR)) return [];
  const results: { name: string; content: string }[] = [];

  // Walk recursively to capture connectionKey/<notebookId>.json structure.
  // relPath is always stored with forward slashes (ZIP archive standard).
  // Skip _orphaned — those belong to deleted connections and should not be backed up.
  const walk = async (dir: string, zipRelPrefix: string) => {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const f of entries) {
      if (f.name === '_orphaned') {
        // skip orphaned notebooks directory
      } else {
        // ZIP entry name always uses '/' (posix), regardless of OS
        const zipRelPath = zipRelPrefix ? `${zipRelPrefix}/${f.name}` : f.name;
        const fullFsPath = path.join(dir, f.name);
        if (f.isDirectory()) {
          await walk(fullFsPath, zipRelPath);
        } else if (f.isFile() && f.name.endsWith('.json')) {
          try {
            const content = await fs.promises.readFile(fullFsPath, 'utf8');
            results.push({ name: zipRelPath, content });
          } catch {
            // skip unreadable files
          }
        }
      }
    }
  };

  await walk(NOTEBOOKS_DIR, '');
  return results;
};

/**
 * Manually walk a directory tree and add each readable file to the archive.
 * This works around macOS TCC restrictions that block archiver.directory()
 * when the folder is in ~/Downloads, ~/Desktop, etc.
 */
async function addDirectoryToArchive(
  arch: archiver.Archiver,
  dirPath: string,
  archivePrefix: string,
): Promise<void> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  } catch {
    // eslint-disable-next-line no-console
    console.warn(`[BackupService] Cannot read directory, skipping: ${dirPath}`);
    return;
  }

  for (const entry of entries) {
    // Filesystem path: always use path.join (OS-native separators)
    const fullPath = path.join(dirPath, entry.name);
    // ZIP archive path: always posix forward slashes (ZIP spec)
    const archivePath = `${archivePrefix}/${entry.name}`;
    try {
      if (entry.isDirectory()) {
        await addDirectoryToArchive(arch, fullPath, archivePath);
      } else if (entry.isFile()) {
        arch.file(fullPath, { name: archivePath });
      }
    } catch {
      // eslint-disable-next-line no-console
      console.warn(`[BackupService] Cannot read entry, skipping: ${fullPath}`);
    }
  }
}

// ─── Service ─────────────────────────────────────────────────────────────────

export default class BackupService {
  /**
   * Export selected categories to a ZIP file at outputPath.
   */
  static async exportBackup(req: BackupExportRequest): Promise<void> {
    const { categories, password, outputPath, onProgress, signal } = req;

    if (categories.includes('secretStore') && !password) {
      throw new Error(
        'A password is required when exporting the Secret Store.',
      );
    }

    const archive = password
      ? archiver(
          'zip-encrypted' as archiver.Format,
          {
            zlib: { level: 9 },
            encryptionMethod: 'zip20',
            password,
          } as any,
        )
      : archiver('zip', {
          zlib: { level: 9 },
        });

    const output = fs.createWriteStream(outputPath);

    if (signal) {
      signal.addEventListener('abort', () => {
        try {
          archive.abort();
          output.destroy();
          if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
          }
        } catch {
          // ignore cleanup errors
        }
      });
    }

    archive.on('progress', (progress) => {
      const total = progress.entries.total || 1;
      const processed = progress.entries.processed || 0;
      onProgress?.(processed, total);
    });

    const archivePromise = new Promise<void>((resolve, reject) => {
      let isDone = false;
      const done = () => {
        if (!isDone) {
          isDone = true;
          resolve();
        }
      };
      output.on('close', done);
      output.on('finish', done);
      output.on('error', (err: Error) => reject(err));
      archive.on('error', (err: any) => reject(err));
      archive.on('warning', (err: any) => {
        // Non-fatal warnings (e.g. missing optional files) — log but continue
        if (err.code === 'ENOENT') {
          // eslint-disable-next-line no-console
          console.warn('[BackupService] archive warning:', err.message);
        } else {
          reject(err);
        }
      });
    });

    archive.pipe(output);

    const db = await loadDatabaseFile();

    // ── Export Individual JSON files (clean layout, non-destructive import) ────
    if (categories.includes('projects')) {
      const projectsJson = JSON.stringify(db.projects ?? [], null, 2);
      archive.append(projectsJson, { name: 'projects.json' });

      // Backup actual project files into Projects/<project_name>/
      const walkPromises: Promise<void>[] = [];
      for (const project of (db.projects ?? []) as any[]) {
        if (project.path && fs.existsSync(project.path)) {
          walkPromises.push(
            addDirectoryToArchive(
              archive,
              project.path,
              `Projects/${project.name}`,
            ).catch((err) => {
              // eslint-disable-next-line no-console
              console.warn(
                `[BackupService] Failed walking project "${project.name}": ${err}`,
              );
            }),
          );
        }
      }
      await Promise.all(walkPromises);
    }

    if (categories.includes('connections')) {
      const connectionsJson = JSON.stringify(db.connections ?? [], null, 2);
      archive.append(connectionsJson, { name: 'connections.json' });
    }

    if (categories.includes('sources')) {
      const sourcesJson = JSON.stringify(db.sources ?? [], null, 2);
      archive.append(sourcesJson, { name: 'sources.json' });
    }

    if (categories.includes('settings')) {
      const settingsJson = JSON.stringify(db.settings ?? {}, null, 2);
      archive.append(settingsJson, { name: 'settings.json' });
    }

    // ── Saved Queries ────────────────────────────────────────────────────────
    if (categories.includes('savedQueries')) {
      const savedQueriesJson = JSON.stringify(db.savedQueries ?? {}, null, 2);
      archive.append(savedQueriesJson, { name: 'savedQueries.json' });
    }

    // ── AI Providers ─────────────────────────────────────────────────────────
    if (categories.includes('aiProviders')) {
      try {
        const providers = await MainDatabaseService.getProviders();
        archive.append(JSON.stringify(providers, null, 2), {
          name: 'aiProviders.json',
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[BackupService] Failed to export AI Providers: ${err}`);
      }
    }

    // ── Analytics Pages ──────────────────────────────────────────────────────
    if (categories.includes('analytics')) {
      try {
        const analytics = await MainDatabaseService.getAllAnalyticsPages();
        archive.append(JSON.stringify(analytics, null, 2), {
          name: 'analyticsPages.json',
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          `[BackupService] Failed to export Analytics Pages: ${err}`,
        );
      }
    }

    // ── Data Lakes (Iceberg & DuckLake) ───────────────────────────────────────
    if (categories.includes('datalake')) {
      // Iceberg
      const icebergJson = JSON.stringify(db.icebergInstances ?? [], null, 2);
      archive.append(icebergJson, { name: 'icebergInstances.json' });

      // DuckLake
      const duckLakePath = path.join(
        app.getPath('userData'),
        'datalake',
        'instances.json',
      );
      if (fs.existsSync(duckLakePath)) {
        const duckLakeJson = fs.readFileSync(duckLakePath, 'utf8');
        archive.append(duckLakeJson, { name: 'ducklakeInstances.json' });
      }
    }

    // ── Notebooks ────────────────────────────────────────────────────
    if (categories.includes('notebooks')) {
      const notebookFiles = await readNotebookFiles();
      for (const { name, content } of notebookFiles) {
        // NOTEBOOKS_PREFIX and name are both posix (forward slashes) — safe to concatenate
        archive.append(content, { name: `${NOTEBOOKS_PREFIX}${name}` });
      }
    }

    // ── Secret Store ─────────────────────────────────────────────────────────
    let hasEncryptedSecretStore = false;
    if (categories.includes('secretStore') && password) {
      try {
        const allCredentials = await this.exportAllCredentials();
        const keystoreJson = JSON.stringify(allCredentials, null, 2);
        archive.append(keystoreJson, { name: SECRET_STORE_ENTRY });
        hasEncryptedSecretStore = true;
      } catch (err) {
        throw new Error(`Failed to export Secret Store: ${err}`);
      }
    }

    // ── Manifest ─────────────────────────────────────────────────────────────
    const manifest: BackupManifest = {
      version: 1,
      createdAt: new Date().toISOString(),
      appVersion: app.getVersion(),
      categories,
      hasEncryptedSecretStore,
    };
    archive.append(JSON.stringify(manifest, null, 2), { name: MANIFEST_ENTRY });

    // ── Finalize & Wait ──────────────────────────────────────────────────────
    await archive.finalize();
    await archivePromise;
  }

  /**
   * Import a backup ZIP file and merge data into the current app state.
   */
  static async importBackup(
    req: BackupImportRequest,
  ): Promise<BackupImportResult> {
    const { filePath, password, onProgress } = req;

    if (!fs.existsSync(filePath)) {
      throw new Error(`Backup file not found: ${filePath}`);
    }

    // Open the zip
    // adm-zip supports extracting from standard password-protected zip files
    // as long as we pass the password here or during extraction.
    // It's sometimes safer to just pass it when extracting the entry.
    const zip = new AdmZip(filePath);

    // ── Read manifest ────────────────────────────────────────────────────────
    const manifestEntry = zip.getEntry(MANIFEST_ENTRY);
    if (!manifestEntry) {
      throw new Error(
        'Invalid backup file: missing backup-manifest.json. This does not appear to be a dbt Studio backup.',
      );
    }

    let manifest: BackupManifest;
    try {
      let dataBuf: Buffer | null = null;
      if (password) {
        // try to read with password first
        dataBuf = zip.readFile(manifestEntry, password);
        if (!dataBuf) throw new Error('Decryption failed');
      } else {
        dataBuf = manifestEntry.getData();
      }

      manifest = JSON.parse(dataBuf.toString('utf8')) as BackupManifest;
    } catch (err: any) {
      if (
        err.message === 'Decryption failed' ||
        (err.message && err.message.includes('password'))
      ) {
        throw new Error('Invalid password provided for this backup.');
      }
      throw new Error(
        'Invalid backup file: could not parse manifest. Did you provide the right password?',
      );
    }

    const result: BackupImportResult = {
      imported: {},
      skipped: [],
      warnings: [],
    };

    // Count total sections for progress reporting
    const totalSections =
      manifest.categories.length + (manifest.hasEncryptedSecretStore ? 1 : 0);
    let doneSections = 0;
    const reportProgress = () => {
      doneSections += 1;
      onProgress?.(doneSections, totalSections);
    };

    // ── Load current state ───────────────────────────────────────────────────
    const currentDb = await loadDatabaseFile();

    // ── Helper to read JSON entry from ZIP (handles individual or legacy snapshot) ──
    const dbSnapshotEntry = zip.getEntry(DB_SNAPSHOT_ENTRY);
    let legacySnapshot: Record<string, any> | null = null;
    if (dbSnapshotEntry) {
      try {
        legacySnapshot = JSON.parse(dbSnapshotEntry.getData().toString('utf8'));
      } catch {
        result.warnings.push('Could not parse legacy db-snapshot.json.');
      }
    }

    const readCategoryJson = (category: string, filename: string): any => {
      const entry = zip.getEntry(filename);
      if (entry) {
        try {
          let dataBuf: Buffer | null = null;
          if (password) {
            dataBuf = zip.readFile(entry, password);
          } else {
            dataBuf = entry.getData();
          }
          if (!dataBuf) return null;

          return JSON.parse(dataBuf.toString('utf8'));
        } catch {
          result.warnings.push(`Could not parse ${filename} — skipped.`);
          return null;
        }
      }
      if (legacySnapshot && legacySnapshot[category]) {
        return legacySnapshot[category];
      }
      return null;
    };

    // ── Restore Connections ─────────────────────────────────────────────────
    if (manifest.categories.includes('connections')) {
      const connectionsData = readCategoryJson(
        'connections',
        'connections.json',
      );
      if (Array.isArray(connectionsData)) {
        const existing = new Set(
          (currentDb.connections || []).map((c: any) => c.id),
        );
        const toAdd = connectionsData.filter((c: any) => !existing.has(c.id));
        if (toAdd.length > 0) {
          await updateDatabase('connections', [
            ...(currentDb.connections || []),
            ...toAdd,
          ]);
        }
        result.imported.connections = toAdd.length;
      }
      reportProgress();
    }

    // ── Restore Cloud Sources ───────────────────────────────────────────────
    if (manifest.categories.includes('sources')) {
      const sourcesData = readCategoryJson('sources', 'sources.json');
      if (Array.isArray(sourcesData)) {
        const existing = new Set(
          (currentDb.sources || []).map((s: any) => s.id),
        );
        const toAdd = sourcesData.filter((s: any) => !existing.has(s.id));
        if (toAdd.length > 0) {
          await updateDatabase('sources', [
            ...(currentDb.sources || []),
            ...toAdd,
          ]);
        }
        result.imported.sources = toAdd.length;
      }
      reportProgress();
    }

    // ── Restore Saved Queries ───────────────────────────────────────────────
    if (manifest.categories.includes('savedQueries')) {
      const savedQueriesData = readCategoryJson(
        'savedQueries',
        'savedQueries.json',
      );
      if (savedQueriesData && typeof savedQueriesData === 'object') {
        const mergedSavedQueries = { ...(currentDb.savedQueries || {}) };
        let importedCount = 0;

        for (const [connId, queries] of Object.entries(savedQueriesData)) {
          if (Array.isArray(queries)) {
            const existing = mergedSavedQueries[connId] || [];
            const existingIds = new Set(existing.map((q: any) => q.id));
            const toAdd = queries.filter((q: any) => !existingIds.has(q.id));
            if (toAdd.length > 0) {
              mergedSavedQueries[connId] = [...existing, ...toAdd];
              importedCount += toAdd.length;
            }
          }
        }

        if (importedCount > 0) {
          await updateDatabase('savedQueries', mergedSavedQueries);
          result.imported.savedQueries = importedCount;
        }
      }
      reportProgress();
    }

    // ── Restore AI Providers ────────────────────────────────────────────────
    if (manifest.categories.includes('aiProviders')) {
      const providersData = readCategoryJson('aiProviders', 'aiProviders.json');
      if (Array.isArray(providersData)) {
        let importedCount = 0;
        try {
          const existingProviders = await MainDatabaseService.getProviders();
          const existingNames = new Set(
            existingProviders.map((p: any) => p.name),
          );

          for (const p of providersData) {
            if (!existingNames.has(p.name)) {
              await MainDatabaseService.saveProvider({
                name: p.name,
                type: p.type,
                config: p.config,
                isActive: p.isActive,
              });
              importedCount += 1;
            }
          }
        } catch (err) {
          result.warnings.push(`Failed to import some AI Providers: ${err}`);
        }
        if (importedCount > 0) result.imported.aiProviders = importedCount;
      }
      reportProgress();
    }

    // ── Restore Analytics Pages ─────────────────────────────────────────────
    if (manifest.categories.includes('analytics')) {
      const analyticsData = readCategoryJson(
        'analytics',
        'analyticsPages.json',
      );
      if (Array.isArray(analyticsData)) {
        let importedCount = 0;
        try {
          const existingPages =
            await MainDatabaseService.getAllAnalyticsPages();
          const existingIds = new Set(existingPages.map((p: any) => p.id));

          for (const p of analyticsData) {
            if (!existingIds.has(p.id)) {
              await MainDatabaseService.importAnalyticsPage({
                id: p.id,
                connectionId: p.connectionId,
                title: p.title,
                routePath: p.routePath,
                markdownContent: p.markdownContent,
                createdAt: p.createdAt,
                updatedAt: p.updatedAt,
              });
              importedCount += 1;
            }
          }
        } catch (err) {
          result.warnings.push(`Failed to import some Analytics pages: ${err}`);
        }
        if (importedCount > 0) result.imported.analytics = importedCount;
      }
      reportProgress();
    }

    // ── Restore Data Lakes ──────────────────────────────────────────────────
    if (manifest.categories.includes('datalake')) {
      let importedCount = 0;

      // 1. Iceberg
      const icebergData = readCategoryJson('datalake', 'icebergInstances.json');
      if (Array.isArray(icebergData)) {
        const existing = new Set(
          (currentDb.icebergInstances || []).map((i: any) => i.id),
        );
        const toAdd = icebergData.filter((i: any) => !existing.has(i.id));
        if (toAdd.length > 0) {
          await updateDatabase('icebergInstances', [
            ...(currentDb.icebergInstances || []),
            ...toAdd,
          ]);
        }
        importedCount += toAdd.length;
      }

      // 2. DuckLake
      const duckLakeEntry = zip.getEntry('ducklakeInstances.json');
      if (duckLakeEntry) {
        try {
          let dataBuf: Buffer | null = null;
          if (password) {
            dataBuf = zip.readFile(duckLakeEntry, password);
          } else {
            dataBuf = duckLakeEntry.getData();
          }

          if (dataBuf) {
            const duckLakeData = JSON.parse(dataBuf.toString('utf8'));
            const duckLakeDir = path.join(app.getPath('userData'), 'datalake');
            const instancesFile = path.join(duckLakeDir, 'instances.json');

            if (!fs.existsSync(duckLakeDir)) {
              fs.mkdirSync(duckLakeDir, { recursive: true });
            }

            let currentInstances: any[] = [];
            let currentVersion = '1.0.0';
            if (fs.existsSync(instancesFile)) {
              const currentContent = JSON.parse(
                fs.readFileSync(instancesFile, 'utf8'),
              );
              currentInstances = currentContent.instances || [];
              currentVersion = currentContent.version || '1.0.0';
            }

            const existingIds = new Set(currentInstances.map((i: any) => i.id));
            const toAdd = (duckLakeData.instances || []).filter(
              (i: any) => !existingIds.has(i.id),
            );

            if (toAdd.length > 0) {
              const newContent = {
                version: currentVersion,
                instances: [...currentInstances, ...toAdd],
                lastModified: new Date().toISOString(),
              };
              fs.writeFileSync(
                instancesFile,
                JSON.stringify(newContent, null, 2),
                'utf8',
              );
            }
            importedCount += toAdd.length;
          }
        } catch {
          result.warnings.push(
            'Could not parse ducklakeInstances.json — skipped.',
          );
        }
      }

      result.imported.datalake = importedCount;
      reportProgress();
    }

    // ── Restore Projects ────────────────────────────────────────────────────
    if (manifest.categories.includes('projects')) {
      const projectsData = readCategoryJson('projects', 'projects.json');
      if (Array.isArray(projectsData)) {
        const targetBaseDir =
          currentDb.settings?.projectsDirectory ||
          path.join(os.homedir(), 'rosetta-dbt-studio-projects');

        const existingNames = new Set(
          (currentDb.projects || []).map((p: any) => p.name),
        );
        const newProjects: any[] = [];

        for (const proj of projectsData) {
          // ZIP entry prefix always uses forward slashes (ZIP spec)
          const zipPrefix = `Projects/${proj.name}/`;
          const projectDest = path.resolve(targetBaseDir, proj.name);

          // Only extract files if the folder doesn't exist yet on this machine.
          // If it already exists, the project is already there — just register the path.
          if (!fs.existsSync(projectDest)) {
            const projectEntries = zip.getEntries().filter((e) =>
              // Normalize to forward slashes before comparing against zipPrefix
              e.entryName.split(path.sep).join('/').startsWith(zipPrefix),
            );

            if (projectEntries.length > 0) {
              fs.mkdirSync(projectDest, { recursive: true });

              for (const entry of projectEntries) {
                if (!entry.isDirectory) {
                  // Always normalize ZIP entry name to forward slashes first
                  const normalizedZipName = entry.entryName
                    .split(path.sep)
                    .join('/');
                  const zipRelativePath = normalizedZipName.substring(
                    zipPrefix.length,
                  );
                  // Split on '/' (posix ZIP) and use path.join to reconstruct OS-native path
                  const fileDest = path.resolve(
                    projectDest,
                    ...zipRelativePath.split('/'),
                  );

                  try {
                    fs.mkdirSync(path.dirname(fileDest), { recursive: true });
                    if (password) {
                      const buf = zip.readFile(entry, password);
                      if (buf) fs.writeFileSync(fileDest, buf as any);
                    } else {
                      fs.writeFileSync(fileDest, entry.getData() as any);
                    }
                  } catch (err: any) {
                    // eslint-disable-next-line no-console
                    console.warn(
                      `[BackupService] Could not write ${fileDest}: ${err.message}`,
                    );
                  }
                }
              }
            }
          }

          // Always update the path in the restored metadata to the local destination
          proj.path = path.normalize(projectDest);

          if (!existingNames.has(proj.name)) {
            newProjects.push(proj);
          }
        }

        if (newProjects.length > 0) {
          await updateDatabase('projects', [
            ...(currentDb.projects || []),
            ...newProjects,
          ]);
          result.imported.projects = newProjects.length;
        }
      }
      reportProgress();
    }

    // ── Restore Settings ────────────────────────────────────────────────────
    if (manifest.categories.includes('settings')) {
      const settingsData = readCategoryJson('settings', 'settings.json');
      if (settingsData && typeof settingsData === 'object') {
        await updateDatabase('settings', {
          ...(currentDb.settings || {}),
          ...settingsData,
        });
        result.imported.settings = 1;
      }
      reportProgress();
    }

    // ── Restore notebooks ────────────────────────────────────────────────────
    if (manifest.categories.includes('notebooks')) {
      let notebookCount = 0;
      const entries = zip
        .getEntries()
        .filter(
          (e) =>
            e.entryName.startsWith(NOTEBOOKS_PREFIX) &&
            !e.isDirectory &&
            e.entryName.endsWith('.json'),
        );

      if (!fs.existsSync(NOTEBOOKS_DIR)) {
        fs.mkdirSync(NOTEBOOKS_DIR, { recursive: true });
      }

      for (const entry of entries) {
        // ZIP entry names are always forward-slash (posix). Strip the prefix, then
        // split on '/' and re-join with path.join so the result is OS-native.
        const zipRelPath = entry.entryName.split(path.sep).join('/');
        const relPath = zipRelPath.substring(NOTEBOOKS_PREFIX.length);
        const destPath = path.join(NOTEBOOKS_DIR, ...relPath.split('/'));

        let dataBuf: Buffer | null = null;
        if (password) {
          dataBuf = zip.readFile(entry, password);
        } else {
          dataBuf = entry.getData();
        }

        if (dataBuf && !fs.existsSync(destPath)) {
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.writeFileSync(destPath, dataBuf.toString('utf8'));
          notebookCount += 1;
        }
      }
      result.imported.notebooks = notebookCount;
      reportProgress();
    }

    // ── Restore secret store ─────────────────────────────────────────────────
    if (manifest.hasEncryptedSecretStore) {
      if (!password) {
        result.warnings.push(
          'Secret Store was included in this backup but no password was provided — skipped.',
        );
      } else {
        const secretEntry = zip.getEntry(SECRET_STORE_ENTRY);
        if (!secretEntry) {
          result.warnings.push(
            'Secret Store entry not found in backup — skipped.',
          );
        } else {
          try {
            // AdmZip supports decrypting entries natively if it is a standard zip encryption
            let keystoreJson = '';
            if (password) {
              const buf = zip.readFile(secretEntry, password);
              if (buf) keystoreJson = buf.toString('utf8');
            } else {
              keystoreJson = secretEntry.getData().toString('utf8');
            }

            if (!keystoreJson) {
              throw new Error('Incorrect password or unreadable entry.');
            }

            const credentials: Array<{
              account: string;
              password: string;
            }> = JSON.parse(keystoreJson);

            let importedCount = 0;
            for (const cred of credentials) {
              if (
                typeof cred.account === 'string' &&
                typeof cred.password === 'string'
              ) {
                // createCredentialIfAbsent won't overwrite existing keys
                const { created } =
                  await SecureStorageService.createCredentialIfAbsent(
                    cred.account,
                    cred.password,
                  );
                if (created) importedCount += 1;
              }
            }
            result.imported.secretStore = importedCount;
          } catch (err) {
            result.warnings.push(
              `Failed to decrypt/import Secret Store: ${err instanceof Error ? err.message : err}. Check that the password is correct.`,
            );
          }
        }
      }
    } else if (!manifest.categories.includes('secretStore')) {
      // Secret store was intentionally excluded — no warning needed
    }

    return result;
  }

  /**
   * Collect all keytar credentials into a serializable array.
   * NOTE: This reads secret values — handle carefully.
   */
  private static async exportAllCredentials(): Promise<
    Array<{ account: string; password: string }>
  > {
    // Get all account names
    const accounts = await SecureStorageService.findCredentials();
    const result: Array<{ account: string; password: string }> = [];

    for (const account of accounts) {
      const pw = await SecureStorageService.getCredential(account);
      if (pw !== null) {
        result.push({ account, password: pw });
      }
    }

    // Also include the environments meta-key if present
    const environments = await SecureStorageService.getEnvironments();
    if (environments.length > 0) {
      result.push({
        account: '__keystore_environments__',
        password: JSON.stringify(environments),
      });
    }

    return result;
  }

  /**
   * Create a temp file path for writing the backup before moving it.
   */
  static getTempBackupPath(): string {
    return path.join(os.tmpdir(), `dbt-studio-backup-${Date.now()}.zip`);
  }
}
