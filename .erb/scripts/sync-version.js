const fs = require('fs');
const path = require('path');

const rootPkg = require('../../package.json');

const { version } = rootPkg;

const filesToUpdate = [
  'release/app/package.json',
  'release/app/package-lock.json',
  'package-lock.json',
];

filesToUpdate.forEach((file) => {
  const filePath = path.resolve(__dirname, '../..', file);
  if (fs.existsSync(filePath)) {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    content.version = version;
    if (content.packages) {
      Object.keys(content.packages).forEach((key) => {
        if (content.packages[key].name === 'rosetta-dbt-studio') {
          content.packages[key] = {
            ...content.packages[key],
            version,
          };
        }
      });
    }
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
    console.log(`Updated ${file} to version ${version}`);
  }
});

const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

// Update the AppStream metadata so Flathub always reads the real committed version.
// Runs automatically on every `npm version` bump.
const appdataPath = path.resolve(__dirname, '../../flatpak/io.rosettadb.DbtStudio.appdata.xml');
if (fs.existsSync(appdataPath)) {
  let appdata = fs.readFileSync(appdataPath, 'utf8');

  appdata = appdata.replace(
    /<releases>[\s\S]*?<\/releases>/,
    `<releases>
    <!-- Auto-updated by npm version via .erb/scripts/sync-version.js — do not edit manually. -->
    <release version="${version}" date="${today}">
      <description>
        <p>See the full release notes at the link below.</p>
      </description>
      <url>https://github.com/rosettadb/dbt-studio/releases/tag/${version}</url>
    </release>
  </releases>`
  );

  fs.writeFileSync(appdataPath, appdata, 'utf8');
  console.log(`Updated appdata.xml to version ${version} (date: ${today})`);
}
