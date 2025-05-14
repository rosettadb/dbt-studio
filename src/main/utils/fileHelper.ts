import path from 'path';
import fs, { promises } from 'fs';
import { app } from 'electron';
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
    sampleRosettaMainConf: path.join(DATA_DIR, 'main.conf'),
    dbtPath: '',
    projectsDirectory: projectsDir,
    pythonVersion: '',
    pythonPath: '',
  };
};

export const loadDatabaseFile = async (): Promise<DataBase> => {
  try {
    const data = await fs.promises.readFile(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return { projects: [], settings: loadDefaultSettings() };
  }
};

export const updateDatabase = async <K extends keyof DataBase>(
  key: K,
  value: DataBase[K],
) => {
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

export const createNewFile = (
  parentPath: string,
  fileName: string,
  content: string = '',
) => {
  const filePath = path.join(parentPath, fileName);

  if (fs.existsSync(filePath)) {
    return;
  }

  fs.writeFile(filePath, content, (err) => {
    if (err) {
      throw new Error(err.message);
    }
  });
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
