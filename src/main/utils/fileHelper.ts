import path from 'path';
import fs, { promises } from 'fs';
import { app, dialog } from 'electron';
import archiver from 'archiver';
import os from 'os';
import {
  DataBase,
  FileNode,
  FileSearchMatch,
  FileSearchResult,
  SettingsType,
} from '../../types/backend';
import { DATA_DIR, DB_FILE } from './setupHelpers';

export const getDirectoryStructure = (dirPath: string): FileNode => {
  const result: FileNode = {
    id: path.basename(dirPath),
    name: path.basename(dirPath),
    path: dirPath,
    type: 'folder',
    children: [],
  };

  const files = fs.readdirSync(dirPath);

  result.children = files.map((file) => {
    const filePath = path.join(dirPath, file);
    const stats = fs.statSync(filePath);

    if (stats.isDirectory()) {
      return getDirectoryStructure(filePath);
    }
    return { id: filePath, name: file, path: filePath, type: 'file' };
  });
  return result;
};

const SEARCH_IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dbt_packages',
  'target',
  'logs',
  '.venv',
  'venv',
  '__pycache__',
]);

const SEARCH_BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.ico',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.tgz',
  '.7z',
  '.rar',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.class',
  '.jar',
  '.parquet',
  '.db',
  '.sqlite',
  '.duckdb',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.mp3',
  '.mp4',
  '.mov',
  '.avi',
  '.wasm',
]);

const SEARCH_MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const SEARCH_MAX_TOTAL_MATCHES = 500;
const SEARCH_MAX_MATCHES_PER_FILE = 50;
const SEARCH_MAX_LINE_TEXT_LENGTH = 300;

/**
 * Recursively greps file contents under `dirPath` for `query`, skipping
 * dependency/build/vcs directories and binary files. Stops walking once
 * SEARCH_MAX_TOTAL_MATCHES is hit (`truncated: true` tells the caller more
 * results exist).
 */
export const searchInFiles = (
  dirPath: string,
  query: string,
  options: { caseSensitive?: boolean; useRegex?: boolean } = {},
): { results: FileSearchResult[]; truncated: boolean } => {
  const results: FileSearchResult[] = [];
  let totalMatches = 0;
  let truncated = false;

  if (!query) {
    return { results, truncated };
  }

  let pattern: RegExp;
  try {
    const source = options.useRegex
      ? query
      : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    pattern = new RegExp(source, options.caseSensitive ? 'g' : 'gi');
  } catch {
    // Invalid regex from the user — treat as no matches rather than throwing.
    return { results, truncated };
  }

  const collectFileMatches = (filePath: string): FileSearchMatch[] => {
    if (SEARCH_BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
      return [];
    }

    let stats: fs.Stats;
    try {
      stats = fs.statSync(filePath);
    } catch {
      return [];
    }
    if (stats.size === 0 || stats.size > SEARCH_MAX_FILE_SIZE) return [];

    let buffer: Buffer;
    try {
      buffer = fs.readFileSync(filePath);
    } catch {
      return [];
    }
    // Cheap binary sniff: a null byte in the first chunk means "not text".
    if (buffer.subarray(0, 8000).includes(0)) return [];

    const lines = buffer.toString('utf8').split('\n');
    const fileMatches: FileSearchMatch[] = [];

    for (let i = 0; i < lines.length; i += 1) {
      if (fileMatches.length >= SEARCH_MAX_MATCHES_PER_FILE) break;
      const line = lines[i];
      pattern.lastIndex = 0;
      let match = pattern.exec(line);
      while (match) {
        fileMatches.push({
          line: i + 1,
          column: match.index + 1,
          length: match[0].length,
          lineText: line.slice(0, SEARCH_MAX_LINE_TEXT_LENGTH),
        });
        if (fileMatches.length >= SEARCH_MAX_MATCHES_PER_FILE) break;
        // Avoid an infinite loop on zero-length matches (e.g. empty regex groups).
        if (match[0].length === 0) pattern.lastIndex += 1;
        match = pattern.exec(line);
      }
    }

    return fileMatches;
  };

  const visit = (dir: string) => {
    if (truncated) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    entries.forEach((entry) => {
      if (truncated) return;
      const entryPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!SEARCH_IGNORED_DIRS.has(entry.name)) visit(entryPath);
        return;
      }

      if (!entry.isFile()) return;

      const fileMatches = collectFileMatches(entryPath);
      if (fileMatches.length === 0) return;

      const remaining = SEARCH_MAX_TOTAL_MATCHES - totalMatches;
      const cappedMatches = fileMatches.slice(0, remaining);
      totalMatches += cappedMatches.length;
      results.push({ path: entryPath, matches: cappedMatches });
      if (totalMatches >= SEARCH_MAX_TOTAL_MATCHES) truncated = true;
    });
  };

  visit(dirPath);
  return { results, truncated };
};

export const readFileContent = (filePath: string): string | null => {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error: any) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
};

export const saveFileContent = async (
  filePath: string,
  content: string,
): Promise<boolean> => {
  try {
    await fs.promises.writeFile(filePath, content, 'utf8');
    return true;
  } catch (error) {
    return false;
  }
};

export const deleteDirectory = (dirPath: string): boolean => {
  fs.rmSync(dirPath, { recursive: true, force: true });
  return true;
};

export const loadDefaultSettings = (): SettingsType => {
  const homeDir = os.homedir();
  const projectsDir = path.join(homeDir, 'rosetta-dbt-studio-projects');

  // Ensure the directory exists
  if (!fs.existsSync(projectsDir)) {
    fs.mkdirSync(projectsDir, { recursive: true });
  }

  return {
    rosettaPath: '',
    rosettaVersion: '',
    dbtSampleDirectory: path.join(DATA_DIR, 'dbt_sample'),
    dbtVersion: '',
    sampleRosettaMainConf: path.join(DATA_DIR, 'main.conf'),
    dbtPath: '',
    projectsDirectory: projectsDir,
    pythonVersion: '',
    pythonPath: '',
    pythonBinary: '',
    isSetup: 'false',
    flowfileVersion: '',
    flowfilePort: '63578',
    flowfileAutoStart: 'false',
  };
};

export const loadDatabaseFile = async (): Promise<DataBase> => {
  try {
    const data = await fs.promises.readFile(DB_FILE, 'utf8');
    const parsed = JSON.parse(data) as Partial<DataBase>;
    return {
      ...parsed,
      projects: parsed.projects ?? [],
      settings: parsed.settings ?? loadDefaultSettings(),
      queries: parsed.queries ?? {},
      connections: parsed.connections ?? [],
      sources: parsed.sources ?? [],
      recentItems: parsed.recentItems ?? [],
    };
  } catch (error) {
    return {
      projects: [],
      settings: loadDefaultSettings(),
      queries: {},
      connections: [],
      sources: [],
      recentItems: [],
    };
  }
};

// Simple async mutex to prevent concurrent read-modify-write races
let dbLockPromise: Promise<void> = Promise.resolve();

export const updateDatabase = async <K extends keyof DataBase>(
  key: K,
  value: DataBase[K],
) => {
  // Chain writes so they execute sequentially
  const previousLock = dbLockPromise;
  let releaseLock: () => void;
  dbLockPromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  try {
    await previousLock;

    // Patch: For connections array, ensure BigQuery keyfile is only the key name
    if (key === 'connections' && Array.isArray(value)) {
      value.forEach((conn) => {
        if (
          conn &&
          typeof conn === 'object' &&
          'connection' in conn &&
          conn.connection &&
          conn.connection.type === 'bigquery' &&
          conn.connection.keyfile &&
          conn.connection.keyfile.startsWith('{')
        ) {
          conn.connection.keyfile = `db-bigquery-${conn.connection.name}`;
        }
      });
    }
    const data = await loadDatabaseFile();
    data[key] = value;
    await saveFileContent(DB_FILE, JSON.stringify(data, null, 2));
  } finally {
    releaseLock!();
  }
};

export const createNewFolder = (parentPath: string, folderName: string) => {
  const folderPath = path.join(parentPath, folderName);

  if (fs.existsSync(folderPath)) {
    return;
  }

  fs.mkdir(folderPath, { recursive: true }, (err) => {
    if (err) {
      throw new Error(err.message);
    }
  });
};

// Like createNewFolder, but actually awaitable: fs.promises.mkdir only
// resolves once the directory exists, so callers that need to write into
// the folder immediately after can safely await this instead of racing
// createNewFolder's fire-and-forget callback.
export const asyncCreateNewFolder = async (
  parentPath: string,
  folderName: string,
): Promise<void> => {
  const folderPath = path.join(parentPath, folderName);
  await fs.promises.mkdir(folderPath, { recursive: true });
};

// helper functions for file copy
const copyFile = async (source: string, target: string) => {
  // Normalize the destination: check if target already ends with the basename
  const sourceBasename = path.basename(source);
  const targetBasename = path.basename(target);
  const targetFile =
    sourceBasename === targetBasename
      ? target
      : path.join(target, sourceBasename);
  // if exists show replace dialog
  if (fs.existsSync(targetFile)) {
    const result = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Cancel', 'Replace'],
      defaultId: 1,
      cancelId: 0,
      message: `The file already exists:\n\n${targetFile}\n\nDo you want to replace it?`,
    });
    if (result.response === 0) return; // user cancelled
  }
  fs.copyFile(source, targetFile, (err) => {
    if (err) throw new Error(err.message);
  });
};

const checkFileConflicts = (srcDir: string, tgtDir: string) => {
  const conflicts: string[] = [];
  const items = fs.readdirSync(srcDir);

  items.forEach((item) => {
    const srcItem = path.join(srcDir, item);
    const tgtItem = path.join(tgtDir, item);
    const itemStat = fs.statSync(srcItem);

    if (itemStat.isDirectory()) {
      conflicts.push(...checkFileConflicts(srcItem, tgtItem));
    } else if (fs.existsSync(tgtItem)) {
      conflicts.push(tgtItem);
    }
  });

  return conflicts;
};

const copyFolder = async (source: string, target: string) => {
  // Normalize the destination: check if target already ends with the basename
  const sourceBasename = path.basename(source);
  const targetBasename = path.basename(target);
  const targetFolder =
    sourceBasename === targetBasename
      ? target
      : path.join(target, sourceBasename);
  const conflicts = checkFileConflicts(source, targetFolder);
  if (conflicts.length > 0) {
    const result = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Cancel', 'Replace All'],
      defaultId: 1,
      cancelId: 0,
      message: `The following files already exist:\n\n${conflicts.join(
        '\n',
      )}\n\nDo you want to replace them?`,
    });
    if (result.response === 0) return; // user cancelled
  }
  fs.cp(
    source,
    targetFolder,
    { recursive: true, force: conflicts.length > 0 },
    (err) => {
      if (err) throw new Error(err.message);
    },
  );
};

export const copyPath = async (source: string, target: string) => {
  if (!fs.existsSync(source)) {
    throw new Error(`Source path does not exist: ${source}`);
  }

  if (!fs.existsSync(target)) {
    throw new Error(`Target path does not exist: ${source}`);
  }

  const stats = fs.statSync(source);
  if (stats.isFile()) {
    copyFile(source, target);
    return;
  }

  await copyFolder(source, target);
};

export const createNewFile = (
  parentPath: string,
  fileName: string,
  content: string = '',
): string | undefined => {
  const filePath = path.join(parentPath, fileName);

  if (!fs.existsSync(parentPath)) {
    fs.mkdirSync(parentPath, { recursive: true });
  }

  if (fs.existsSync(filePath)) {
    return;
  }

  fs.writeFileSync(filePath, content);
  // eslint-disable-next-line consistent-return
  return filePath;
};

export const deleteItem = async (targetPath: string) => {
  if (!fs.existsSync(targetPath)) {
    return;
  }
  const stats = await promises.stat(targetPath);
  if (stats.isDirectory()) {
    await promises.rm(targetPath, { recursive: true, force: true });
  } else {
    await promises.unlink(targetPath);
  }
};

export const renamePath = async (source: string, newName: string) => {
  if (!fs.existsSync(source)) {
    throw new Error(`Source path does not exist: ${source}`);
  }
  const dir = path.dirname(source);
  const target = path.join(dir, newName);
  // If target exists, throw to avoid accidental overwrite
  if (fs.existsSync(target)) {
    throw new Error(`Target already exists: ${target}`);
  }
  await promises.rename(source, target);
  return target;
};

export const createZipArchive = async (
  sourceDir: string,
  zipFilePath: string,
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver('zip', {
      zlib: { level: 9 },
    });

    output.on('close', () => resolve());
    archive.on('error', (err) => reject(err));
    archive.on('warning', (err) => {
      if (err.code !== 'ENOENT') {
        reject(err);
      }
    });

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
};

export const copyAssetsToUserData = () => {
  const userAssetsDir = path.join(app.getPath('userData'));
  const assetsPath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '..', '..', 'assets');

  if (!fs.existsSync(userAssetsDir)) {
    fs.mkdirSync(userAssetsDir, { recursive: true });
  }

  fs.cpSync(
    path.join(assetsPath, 'dbt_sample'),
    path.join(userAssetsDir, 'dbt_sample'),
    {
      recursive: true,
    },
  );
  fs.cpSync(
    path.join(assetsPath, 'main.conf'),
    path.join(userAssetsDir, 'main.conf'),
  );
};
