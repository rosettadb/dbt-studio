/**
 * Runs before `npm run rebuild` (npm `prerebuild` hook) so the shared
 * electron-rebuild step skips ibm_db (Db2) instead of failing on it.
 *
 * ibm_db is an N-API module: the binary its installer builds during
 * `npm install` already runs in Electron. A plain node-gyp rebuild can't
 * compile it (its binding.gyp needs IBM_DB_HOME, which only that installer
 * sets). @electron/rebuild skips a module that uses prebuildify and ships a
 * matching N-API binary, so this script presents the installed binary that
 * way:
 *   - copies build/Release/odbc_bindings.node to
 *     prebuilds/<platform>-<arch>/node.napi.<ext>;
 *   - adds prebuildify to ibm_db's devDependencies in node_modules.
 * The runtime still loads build/Release/odbc_bindings.node; nothing else
 * changes. If ibm_db or its binary is missing, it does nothing.
 */
const fs = require('fs');
const path = require('path');

const moduleDir = path.resolve(__dirname, '..', 'node_modules', 'ibm_db');
const binary = path.join(moduleDir, 'build', 'Release', 'odbc_bindings.node');
const manifestPath = path.join(moduleDir, 'package.json');

if (fs.existsSync(binary) && fs.existsSync(manifestPath)) {
  const { arch, platform } = process;
  // Same file names @electron/rebuild looks for (module-type/prebuildify).
  const extension = arch === 'arm64' ? 'armv8.node' : 'node';
  const prebuildDir = path.join(moduleDir, 'prebuilds', `${platform}-${arch}`);
  fs.mkdirSync(prebuildDir, { recursive: true });
  fs.copyFileSync(binary, path.join(prebuildDir, `node.napi.${extension}`));

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest.devDependencies?.prebuildify) {
    manifest.devDependencies = {
      ...manifest.devDependencies,
      prebuildify: '*',
    };
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
}
