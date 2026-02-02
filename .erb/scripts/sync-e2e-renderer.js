const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');

const srcDir = path.join(repoRoot, 'release', 'app', 'dist', 'renderer');
const destDir = path.join(repoRoot, '.erb', 'renderer');

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const isDirectoryNonEmpty = (dir) => {
  try {
    return fs.existsSync(dir) && fs.readdirSync(dir).length > 0;
  } catch {
    return false;
  }
};

const copyDirContents = (from, to) => {
  ensureDir(to);
  fs.cpSync(from, to, {
    recursive: true,
    force: true,
  });
};

const main = () => {
  if (!isDirectoryNonEmpty(srcDir)) {
    throw new Error(
      `Renderer build output not found or empty at: ${srcDir}. Run "npm run build:renderer" first.`,
    );
  }

  copyDirContents(srcDir, destDir);

  const indexPath = path.join(destDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error(
      `Renderer sync completed but index.html missing at: ${indexPath}`,
    );
  }

  // eslint-disable-next-line no-console
  console.log(`✅ Synced renderer for E2E: ${srcDir} -> ${destDir}`);
};

main();
