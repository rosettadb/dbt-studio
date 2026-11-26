import fs from 'fs';
import path from 'path';

// Internal extensions import Studio's pieces from the files in
// src/extensionApi/studio (UI half) and src/extensionApi/studioMain (main
// half). Installed extensions get the index of each folder at run time
// ('@rosetta/studio-api' in the window, `api.studio` in the main process).
// Every file must be in its index, or an internal extension could use
// something an installed one cannot.

const API_ROOT = path.join(__dirname, '../../../src/extensionApi');
const EXTENSIONS_ROOT = path.join(__dirname, '../../../src/extensions');

const filesOf = (folder: string): string[] =>
  fs
    .readdirSync(path.join(API_ROOT, folder))
    .filter((file) => file.endsWith('.ts') && file !== 'index.ts')
    .map((file) => file.replace(/\.ts$/, ''));

const indexOf = (folder: string): string =>
  fs.readFileSync(path.join(API_ROOT, folder, 'index.ts'), 'utf8');

const sourceFilesUnder = (folder: string): string[] =>
  fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });

describe('what internal extensions use is what installed extensions get', () => {
  it('lists every main-process piece in the studioMain index', () => {
    const index = indexOf('studioMain');
    const missing = filesOf('studioMain').filter(
      (name) => !index.includes(`'./${name}'`),
    );
    expect(missing).toEqual([]);
  });

  it('gives a name to every main-process piece that is a default export', () => {
    const index = indexOf('studioMain');
    const unnamed = filesOf('studioMain').filter((name) => {
      const source = fs.readFileSync(
        path.join(API_ROOT, 'studioMain', `${name}.ts`),
        'utf8',
      );
      return (
        /export default/.test(source) &&
        // settingsService's default is SettingsService, listed by './services'
        name !== 'settingsService' &&
        !new RegExp(`default as \\w+ \\} from './${name}'`).test(index)
      );
    });
    expect(unnamed).toEqual([]);
  });

  it('lists every UI piece in the studio index', () => {
    const index = indexOf('studio');
    // In the list under the same names through another file of the folder.
    const listedThroughAnotherFile: Record<string, string> = {
      duckLakeService: './services',
      useLocalStorage: './hooks',
      useSecureStorage: './hooks',
    };
    const missing = filesOf('studio').filter(
      (name) =>
        !index.includes(`'./${name}'`) && !listedThroughAnotherFile[name],
    );
    expect(missing).toEqual([]);
    Object.values(listedThroughAnotherFile).forEach((file) =>
      expect(index).toContain(`'${file}'`),
    );
  });

  it('lets internal extensions reach Studio only through the API folders', () => {
    const outside = sourceFilesUnder(EXTENSIONS_ROOT).flatMap((file) => {
      const source = fs.readFileSync(file, 'utf8');
      const specifiers = Array.from(
        source.matchAll(/from\s+'(\.\.?\/[^']*)'/g),
        (match) => match[1],
      );
      return specifiers
        .map((specifier) => path.resolve(path.dirname(file), specifier))
        .filter(
          (target) =>
            !target.startsWith(EXTENSIONS_ROOT) && !target.startsWith(API_ROOT),
        )
        .map(
          (target) => `${path.relative(EXTENSIONS_ROOT, file)} -> ${target}`,
        );
    });
    expect(outside).toEqual([]);
  });
});
