/* eslint-disable no-bitwise -- file mode bits */
const fs = require('fs');
const path = require('path');

// IBM's Db2 CLI driver (ibm_db/installer/clidriver) ships some files
// read-only, e.g. a license PDF in lib/icc on arm64. @electron/osx-sign runs
// codesign on every non-text file in the bundle, and codesign writes the
// signature of a non-Mach-O file into its extended attributes, so a read-only
// file fails with "Permission denied". Add the owner-write bit to everything
// in app.asar.unpacked before electron-builder signs the app.
async function makeOwnerWritable(dir) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      if (entry.isSymbolicLink()) return;
      const target = path.join(dir, entry.name);
      const { mode } = await fs.promises.stat(target);
      if ((mode & 0o200) === 0) {
        await fs.promises.chmod(target, mode | 0o200);
      }
      if (entry.isDirectory()) {
        await makeOwnerWritable(target);
      }
    }),
  );
}

exports.default = async function afterPack(context) {
  // `mas` is a Mac App Store build; it is signed the same way as `darwin`.
  if (!['darwin', 'mas'].includes(context.electronPlatformName)) {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const unpackedDir = path.join(
    context.appOutDir,
    `${appName}.app`,
    'Contents',
    'Resources',
    'app.asar.unpacked',
  );

  if (fs.existsSync(unpackedDir)) {
    await makeOwnerWritable(unpackedDir);
  }
};
