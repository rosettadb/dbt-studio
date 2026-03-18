import path from 'path';
import fs, { promises } from 'fs';
import { app, dialog } from 'electron';
import archiver from 'archiver';
import os from 'os';
import { DataBase, FileNode, SettingsType } from '../../types/backend';
import { DATA_DIR, DB_FILE } from './setupHelpers';

export const getDirectoryStructure = (dirPath: string): FileNode => {
  const result: FileNode = {
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
    return { name: file, path: filePath, type: 'file' };
  });
  return result;
};

export const readFileContent = (filePath: string): string | null => {
  return fs.readFileSync(filePath, 'utf8');
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
    dbtRuntime: 'dbt-core',
    dbtFusionPath: '',
    dbtFusionVersion: '',
    sampleRosettaMainConf: path.join(DATA_DIR, 'main.conf'),
    dbtPath: '',
    projectsDirectory: projectsDir,
    pythonVersion: '',
    pythonPath: '',
    pythonBinary: '',
    isSetup: 'false',
  };
};

export const loadDatabaseFile = async (): Promise<DataBase> => {
  try {
    const data = await fs.promises.readFile(DB_FILE, 'utf8');
    return JSON.parse(data);
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

export const updateDatabase = async <K extends keyof DataBase>(
  key: K,
  value: DataBase[K],
) => {
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

// helper functions for file copy
const copyFile = async (source: string, target: string) => {
  const targetFile = path.join(target, path.basename(source));
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
  const conflicts = checkFileConflicts(source, target);
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
    target,
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
