import fs from 'fs-extra';
import path from 'path';

// The managed interpreter lives in <venv>/bin or <venv>/Scripts. Read the
// current package location each run so a Python upgrade cannot leave a stale
// SPARK_HOME, and shell steps can use Spark without an interpreter probe.
export async function discoverSparkHome(
  pythonPath: string,
): Promise<string | undefined> {
  const venvDir = path.dirname(path.dirname(pythonPath));
  let sitePackages: string[];
  if (process.platform === 'win32') {
    sitePackages = [path.join(venvDir, 'Lib', 'site-packages')];
  } else {
    const libDir = path.join(venvDir, 'lib');
    const versions = await fs.readdir(libDir).catch(() => []);
    sitePackages = versions
      .filter((name) => /^python\d+\.\d+$/.test(name))
      .map((name) => path.join(libDir, name, 'site-packages'));
  }
  const homes = sitePackages.map((dir) => path.join(dir, 'pyspark'));
  const installed = await Promise.all(
    homes.map((home) => fs.pathExists(path.join(home, 'bin', 'spark-class'))),
  );
  return homes.find((_, index) => installed[index]);
}
