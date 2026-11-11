/**
 * Project notebooks (plan 95c): ids, folder scan and path resolution for
 * `<project>/notebooks/**.ipynb`, on a temp project folder.
 */

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import {
  freeNotebookPath,
  notebookFileStem,
  parseProjectNotebookId,
  pathKey,
  projectNotebookId,
  resolveProjectNotebookPath,
  scanProjectNotebooks,
} from '../../../../src/main/utils/projectNotebookFiles';

const PROJECT_ID = '1731000000000';

const writeNotebook = async (file: string, key?: string) => {
  await fs.mkdirp(path.dirname(file));
  await fs.writeJson(file, {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: key ? { rosetta: { key } } : {},
    cells: [],
  });
};

describe('projectNotebookFiles', () => {
  let projectPath: string;
  let notebooksDir: string;

  beforeEach(async () => {
    projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'rosetta-proj-'));
    notebooksDir = path.join(projectPath, 'notebooks');
  });

  afterEach(async () => {
    await fs.remove(projectPath);
  });

  it('round-trips ids and rejects malformed ones', () => {
    const id = projectNotebookId(PROJECT_ID, 'abcdef012345');
    expect(id).toBe(`pnb_${PROJECT_ID}_abcdef012345`);
    expect(parseProjectNotebookId(id)).toEqual({
      projectId: PROJECT_ID,
      key: 'abcdef012345',
    });
    expect(parseProjectNotebookId('8f2c-uuid-notebook')).toBeNull();
    expect(parseProjectNotebookId(`pnb_${PROJECT_ID}_short`)).toBeNull();
    expect(parseProjectNotebookId('pnb_../x_abcdef012345')).toBeNull();
    expect(() => projectNotebookId('a_b', 'abcdef012345')).toThrow();
  });

  it('turns names into safe file stems and avoids collisions', async () => {
    expect(notebookFileStem('Sales review')).toBe('sales_review');
    expect(notebookFileStem('  ../Évolution 2026!  ')).toBe('volution_2026');
    expect(notebookFileStem('***')).toBe('notebook');

    await writeNotebook(path.join(notebooksDir, 'sales.ipynb'));
    expect(await freeNotebookPath(notebooksDir, 'sales')).toBe(
      path.join(notebooksDir, 'sales_2.ipynb'),
    );
  });

  it('uses the stored key, else the path hash, and skips hidden folders', async () => {
    await writeNotebook(path.join(notebooksDir, 'a.ipynb'), 'aaaaaaaaaaaa');
    await writeNotebook(path.join(notebooksDir, 'sub', 'b.ipynb'));
    await writeNotebook(
      path.join(notebooksDir, '.ipynb_checkpoints', 'a-checkpoint.ipynb'),
    );
    await fs.writeFile(path.join(notebooksDir, 'notes.txt'), 'x');

    const files = await scanProjectNotebooks(PROJECT_ID, projectPath);

    expect(files.map((f) => f.relativePath)).toEqual([
      'a.ipynb',
      'sub/b.ipynb',
    ]);
    expect(files[0].key).toBe('aaaaaaaaaaaa');
    expect(files[1].key).toBe(pathKey('sub/b.ipynb'));
  });

  it('gives a copied file (same stored key) its own id', async () => {
    await writeNotebook(path.join(notebooksDir, 'a.ipynb'), 'aaaaaaaaaaaa');
    await writeNotebook(
      path.join(notebooksDir, 'a_copy.ipynb'),
      'aaaaaaaaaaaa',
    );

    const files = await scanProjectNotebooks(PROJECT_ID, projectPath);

    expect(files[0].key).toBe('aaaaaaaaaaaa');
    expect(files[1].key).toBe(pathKey('a_copy.ipynb'));
    expect(new Set(files.map((f) => f.id)).size).toBe(2);
  });

  it('keeps the id across a rename once the key is stored', async () => {
    const before = path.join(notebooksDir, 'old_name.ipynb');
    await writeNotebook(before, 'bbbbbbbbbbbb');
    const id = projectNotebookId(PROJECT_ID, 'bbbbbbbbbbbb');
    expect(await resolveProjectNotebookPath(id, projectPath)).toBe(before);

    const after = path.join(notebooksDir, 'new_name.ipynb');
    await fs.rename(before, after);

    expect(await resolveProjectNotebookPath(id, projectPath)).toBe(after);
  });

  it('does not follow symlinks out of the notebooks folder', async () => {
    const outside = path.join(projectPath, 'outside');
    await writeNotebook(path.join(outside, 'secret.ipynb'), 'cccccccccccc');
    await fs.mkdirp(notebooksDir);
    await fs.symlink(outside, path.join(notebooksDir, 'link'));

    const files = await scanProjectNotebooks(PROJECT_ID, projectPath);
    expect(files).toEqual([]);
    await expect(
      resolveProjectNotebookPath(
        projectNotebookId(PROJECT_ID, 'cccccccccccc'),
        projectPath,
      ),
    ).rejects.toThrow('not found');
  });
});
