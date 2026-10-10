import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { isManifestStale } from '../../../../src/main/utils/dbtManifest';

const touch = async (file: string, secondsAgo: number) => {
  await fs.mkdirp(path.dirname(file));
  if (!(await fs.pathExists(file))) await fs.writeFile(file, '{}');
  const t = new Date(Date.now() - secondsAgo * 1000);
  await fs.utimes(file, t, t);
};

describe('isManifestStale', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dbt-manifest-'));
    await fs.writeFile(path.join(dir, 'dbt_project.yml'), 'name: x\n');
    await touch(path.join(dir, 'dbt_project.yml'), 100);
  });

  afterEach(async () => {
    await fs.remove(dir);
  });

  it('is stale when the manifest is missing', async () => {
    expect(await isManifestStale(dir)).toBe(true);
  });

  it('is fresh when the manifest is newer than every source', async () => {
    await touch(path.join(dir, 'models', 'a.sql'), 50);
    await touch(path.join(dir, 'target', 'manifest.json'), 10);
    expect(await isManifestStale(dir)).toBe(false);
  });

  it('is stale when a model is newer than the manifest', async () => {
    await touch(path.join(dir, 'target', 'manifest.json'), 50);
    await touch(path.join(dir, 'models', 'nested', 'a.sql'), 5);
    expect(await isManifestStale(dir)).toBe(true);
  });

  it('is stale when dbt_project.yml is newer than the manifest', async () => {
    await touch(path.join(dir, 'target', 'manifest.json'), 50);
    await touch(path.join(dir, 'dbt_project.yml'), 1);
    expect(await isManifestStale(dir)).toBe(true);
  });

  it('honours custom model-paths and checks macros, seeds and snapshots', async () => {
    await fs.writeFile(
      path.join(dir, 'dbt_project.yml'),
      'name: x\nmodel-paths: ["sql"]\n',
    );
    await touch(path.join(dir, 'dbt_project.yml'), 100);
    await touch(path.join(dir, 'target', 'manifest.json'), 50);
    await touch(path.join(dir, 'models', 'ignored.sql'), 1);
    expect(await isManifestStale(dir)).toBe(false);
    await touch(path.join(dir, 'seeds', 's.csv'), 1);
    expect(await isManifestStale(dir)).toBe(true);
  });
});
