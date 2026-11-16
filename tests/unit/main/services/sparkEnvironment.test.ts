import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { discoverSparkHome } from '../../../../src/main/services/sparkEnvironment';

describe('discoverSparkHome', () => {
  let venvDir: string;

  beforeEach(async () => {
    venvDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-spark-'));
  });

  afterEach(async () => {
    await fs.remove(venvDir);
  });

  it('uses the current PySpark package after a Python upgrade', async () => {
    const pythonPath = path.join(
      venvDir,
      process.platform === 'win32' ? 'Scripts' : 'bin',
      process.platform === 'win32' ? 'python.exe' : 'python3',
    );
    const packageDir = (version: string) =>
      process.platform === 'win32'
        ? path.join(venvDir, 'Lib', 'site-packages', 'pyspark')
        : path.join(venvDir, 'lib', version, 'site-packages', 'pyspark');
    const oldHome = packageDir('python3.11');
    const newHome = packageDir('python3.12');

    await fs.outputFile(path.join(oldHome, 'bin', 'spark-class'), '');
    expect(await discoverSparkHome(pythonPath)).toBe(oldHome);

    await fs.remove(oldHome);
    await fs.outputFile(path.join(newHome, 'bin', 'spark-class'), '');
    expect(await discoverSparkHome(pythonPath)).toBe(newHome);
  });
});
