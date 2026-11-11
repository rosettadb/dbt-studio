/**
 * Notebooks saved in a project folder (plan 95c): `<project>/notebooks/**.ipynb`.
 *
 * Identity: `pnb_<projectId>_<key>`. The key is 12 hex characters, read from
 * the file's `metadata.rosetta.key`, or, for a file Studio hasn't saved yet,
 * the first 12 hex of sha1(path relative to notebooks/). Studio writes the
 * key it used on the next save, so the id survives renames and moves, and the
 * notebook's venv and kernel (keyed by id) survive with it. Two files with the
 * same key (a copy made in the Explorer): the first by sorted path keeps it,
 * the other falls back to its path hash.
 *
 * Every path returned stays inside the project's notebooks folder: symlinks
 * are skipped, and `..` can't appear because paths come from the folder scan.
 */
import crypto from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import {
  PROJECT_NOTEBOOKS_DIR,
  PROJECT_NOTEBOOK_ID_PREFIX,
} from '../../shared/projectNotebooks';

const KEY_PATTERN = /^[0-9a-f]{12}$/;
// Project ids are Date.now() strings; no "_" so the id splits unambiguously
const PROJECT_ID_PATTERN = /^[A-Za-z0-9-]+$/;
const SKIPPED_FOLDERS = new Set(['node_modules', '__pycache__']);

export interface ProjectNotebookFile {
  id: string;
  key: string;
  /** Absolute path of the .ipynb file. */
  filePath: string;
  /** Path relative to the notebooks folder, with forward slashes. */
  relativePath: string;
}

export const projectNotebooksRoot = (projectPath: string): string =>
  path.join(projectPath, PROJECT_NOTEBOOKS_DIR);

export const projectNotebookId = (projectId: string, key: string): string => {
  if (!PROJECT_ID_PATTERN.test(projectId)) {
    throw new Error(`Invalid project id: "${projectId}"`);
  }
  if (!KEY_PATTERN.test(key)) throw new Error(`Invalid notebook key: "${key}"`);
  return `${PROJECT_NOTEBOOK_ID_PREFIX}${projectId}_${key}`;
};

export function parseProjectNotebookId(
  notebookId: string,
): { projectId: string; key: string } | null {
  if (!notebookId.startsWith(PROJECT_NOTEBOOK_ID_PREFIX)) return null;
  const rest = notebookId.slice(PROJECT_NOTEBOOK_ID_PREFIX.length);
  const separator = rest.lastIndexOf('_');
  if (separator <= 0) return null;
  const projectId = rest.slice(0, separator);
  const key = rest.slice(separator + 1);
  if (!PROJECT_ID_PATTERN.test(projectId) || !KEY_PATTERN.test(key)) {
    return null;
  }
  return { projectId, key };
}

export const newNotebookKey = (): string =>
  crypto.randomBytes(6).toString('hex');

export const pathKey = (relativePath: string): string =>
  crypto
    .createHash('sha1')
    .update(relativePath.split(path.sep).join('/'))
    .digest('hex')
    .slice(0, 12);

/** `Sales review` → `sales_review`. */
export const notebookFileStem = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'notebook';

/** A free `<stem>.ipynb` path in `folder`, adding `_2`, `_3`... on collision. */
export async function freeNotebookPath(
  folder: string,
  stem: string,
): Promise<string> {
  let candidate = path.join(folder, `${stem}.ipynb`);
  let suffix = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await fs.pathExists(candidate)) {
    candidate = path.join(folder, `${stem}_${suffix}.ipynb`);
    suffix += 1;
  }
  return candidate;
}

async function readKey(filePath: string): Promise<string | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    const key = parsed?.metadata?.rosetta?.key;
    return typeof key === 'string' && KEY_PATTERN.test(key) ? key : null;
  } catch {
    return null;
  }
}

async function walk(folder: string, found: string[]): Promise<void> {
  const entries = await fs.readdir(folder, { withFileTypes: true });
  // eslint-disable-next-line no-restricted-syntax
  for (const entry of entries) {
    // Symlinks could point out of the project; checkpoints are Jupyter's
    if (entry.isSymbolicLink() || entry.name.startsWith('.')) {
      // eslint-disable-next-line no-continue
      continue;
    }
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_FOLDERS.has(entry.name)) {
        // eslint-disable-next-line no-await-in-loop
        await walk(full, found);
      }
    } else if (entry.isFile() && entry.name.endsWith('.ipynb')) {
      found.push(full);
    }
  }
}

/** Last scan result per notebook id, so cell runs don't rescan the folder. */
const pathCache = new Map<string, string>();

export function rememberProjectNotebookPath(id: string, filePath: string) {
  pathCache.set(id, filePath);
}

export function forgetProjectNotebookPath(id: string) {
  pathCache.delete(id);
}

export async function scanProjectNotebooks(
  projectId: string,
  projectPath: string,
): Promise<ProjectNotebookFile[]> {
  const root = projectNotebooksRoot(projectPath);
  if (!(await fs.pathExists(root))) return [];

  const files: string[] = [];
  await walk(root, files);
  const relativePaths = files
    .map((file) => path.relative(root, file).split(path.sep).join('/'))
    .sort();

  const used = new Set<string>();
  const result: ProjectNotebookFile[] = [];
  // eslint-disable-next-line no-restricted-syntax
  for (const relativePath of relativePaths) {
    const filePath = path.join(root, relativePath);
    // eslint-disable-next-line no-await-in-loop
    const stored = await readKey(filePath);
    let key = stored && !used.has(stored) ? stored : pathKey(relativePath);
    if (used.has(key)) key = newNotebookKey();
    used.add(key);
    const id = projectNotebookId(projectId, key);
    pathCache.set(id, filePath);
    result.push({ id, key, filePath, relativePath });
  }
  return result;
}

/** The file behind a project notebook id, or an error if it's gone. */
export async function resolveProjectNotebookPath(
  notebookId: string,
  projectPath: string,
): Promise<string> {
  const parsed = parseProjectNotebookId(notebookId);
  if (!parsed) throw new Error(`Invalid notebook id: "${notebookId}"`);
  const root = path.resolve(projectNotebooksRoot(projectPath));

  const cached = pathCache.get(notebookId);
  if (cached && (await fs.pathExists(cached))) return cached;

  const files = await scanProjectNotebooks(parsed.projectId, projectPath);
  const match = files.find((file) => file.id === notebookId);
  if (!match) throw new Error('Notebook file not found in the project');
  if (!path.resolve(match.filePath).startsWith(`${root}${path.sep}`)) {
    throw new Error('Notebook path is outside the project notebooks folder');
  }
  return match.filePath;
}
