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
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
    console.log(`Updated ${file} to version ${version}`);
  }
});
