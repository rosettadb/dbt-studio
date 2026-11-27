import { app } from 'electron';
import fs from 'fs-extra';
import path from 'path';
import AdmZip from 'adm-zip';
import {
  MANIFEST_FILE,
  extensionIdOf,
  parseExtensionManifest,
  type ExtensionManifest,
} from '../shared/manifest.shared';

/**
 * Everything the extension host keeps on disk: the folder installed
 * extensions live in, which extensions the user switched off, and the
 * install / uninstall file operations. No activation logic here.
 */

const STATE_FILE = 'state.json';
const STAGING_PREFIX = '.staging-';

export interface ExtensionsState {
  /** Ids the user switched off. Everything else is on. */
  disabled: string[];
}

export interface DiscoveredExtension {
  /** Folder name under the extensions root. */
  folderName: string;
  location: string;
  manifest?: ExtensionManifest;
  /** Why the folder is not a usable extension. */
  errors?: string[];
}

export interface StagedExtension {
  manifest: ExtensionManifest;
  /** Folder holding the extension's files, inside `stagingDir`. */
  packageRoot: string;
  stagingDir: string;
}

export const getExtensionsRoot = (): string =>
  path.join(app.getPath('userData'), 'extensions');

export const getExtensionStoragePath = (extensionId: string): string =>
  path.join(app.getPath('userData'), 'extension-data', extensionId);

export const readState = (): ExtensionsState => {
  try {
    const raw = fs.readJsonSync(path.join(getExtensionsRoot(), STATE_FILE));
    const disabled = Array.isArray(raw?.disabled)
      ? raw.disabled.filter((id: unknown) => typeof id === 'string')
      : [];
    return { disabled };
  } catch {
    // No file yet, or unreadable: nothing is switched off.
    return { disabled: [] };
  }
};

export const writeState = (state: ExtensionsState): void => {
  fs.ensureDirSync(getExtensionsRoot());
  fs.writeJsonSync(path.join(getExtensionsRoot(), STATE_FILE), state, {
    spaces: 2,
  });
};

const readManifestAt = (
  folder: string,
): { manifest?: ExtensionManifest; errors?: string[] } => {
  const manifestPath = path.join(folder, MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) {
    return { errors: [`No ${MANIFEST_FILE} found`] };
  }
  try {
    const parsed = parseExtensionManifest(fs.readJsonSync(manifestPath));
    return parsed.ok
      ? { manifest: parsed.manifest }
      : { errors: parsed.errors };
  } catch (error) {
    return {
      errors: [
        `${MANIFEST_FILE} could not be read: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
    };
  }
};

/** Every folder under the extensions root, usable or not. */
export const discoverInstalled = (): DiscoveredExtension[] => {
  const root = getExtensionsRoot();
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => {
      const location = path.join(root, entry.name);
      return { folderName: entry.name, location, ...readManifestAt(location) };
    });
};

const isInside = (parent: string, child: string): boolean => {
  const relative = path.relative(parent, child);
  return (
    relative.length > 0 &&
    !relative.startsWith('..') &&
    !path.isAbsolute(relative)
  );
};

const extractZip = (zipPath: string, targetDir: string): void => {
  const zip = new AdmZip(zipPath);
  zip.getEntries().forEach((entry) => {
    const target = path.resolve(targetDir, entry.entryName);
    // A crafted archive must not write outside the staging folder.
    if (!isInside(targetDir, target)) {
      throw new Error(
        `The archive has an entry outside it: ${entry.entryName}`,
      );
    }
    if (entry.isDirectory) {
      fs.ensureDirSync(target);
      return;
    }
    fs.ensureDirSync(path.dirname(target));
    fs.writeFileSync(target, entry.getData());
  });
};

/** The folder with the manifest: the staging folder itself or its only subfolder. */
const findPackageRoot = (stagingDir: string): string => {
  if (fs.existsSync(path.join(stagingDir, MANIFEST_FILE))) return stagingDir;
  const folders = fs
    .readdirSync(stagingDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory());
  if (
    folders.length === 1 &&
    fs.existsSync(path.join(stagingDir, folders[0].name, MANIFEST_FILE))
  ) {
    return path.join(stagingDir, folders[0].name);
  }
  return stagingDir;
};

/**
 * Copies or unpacks an extension (a folder or a `.zip`) into a staging
 * folder and validates it. Nothing is installed yet: the caller commits or
 * discards the result.
 */
export const stageInstall = (sourcePath: string): StagedExtension => {
  const root = getExtensionsRoot();
  fs.ensureDirSync(root);
  const stagingDir = path.join(root, `${STAGING_PREFIX}${Date.now()}`);
  fs.ensureDirSync(stagingDir);

  try {
    const isDirectory = fs.statSync(sourcePath).isDirectory();
    if (!isDirectory && !sourcePath.toLowerCase().endsWith('.zip')) {
      throw new Error('An extension is a folder or a .zip file');
    }
    if (isDirectory) {
      fs.copySync(sourcePath, stagingDir);
    } else {
      extractZip(sourcePath, stagingDir);
    }

    const packageRoot = findPackageRoot(stagingDir);
    const { manifest, errors } = readManifestAt(packageRoot);
    if (!manifest) {
      throw new Error((errors ?? ['Invalid extension']).join('; '));
    }
    return { manifest, packageRoot, stagingDir };
  } catch (error) {
    fs.removeSync(stagingDir);
    throw error;
  }
};

export const discardStaged = (staged: StagedExtension): void => {
  fs.removeSync(staged.stagingDir);
};

/** Moves a staged extension into place, replacing an older copy. Returns its folder. */
export const commitInstall = (staged: StagedExtension): string => {
  const target = path.join(getExtensionsRoot(), extensionIdOf(staged.manifest));
  fs.removeSync(target);
  fs.moveSync(staged.packageRoot, target);
  fs.removeSync(staged.stagingDir);
  return target;
};

export const removeInstalled = (location: string): void => {
  // Only ever delete inside the extensions root.
  if (!isInside(getExtensionsRoot(), location)) {
    throw new Error(
      'Refusing to remove a folder outside the extensions folder',
    );
  }
  fs.removeSync(location);
};
