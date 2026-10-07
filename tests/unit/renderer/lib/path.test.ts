import nodePath from 'path';
import {
  path,
  toPosix,
  splitSegments,
  isInside,
  isWindows,
  isMac,
  isLinux,
  getPlatform,
} from '../../../../src/renderer/lib/path';
import {
  installIpcRendererMock,
  setMockPlatform,
} from '../../__setup__/ipcRenderer.mock';

describe('renderer/lib/path', () => {
  afterEach(() => {
    installIpcRendererMock();
  });

  describe('delegates to the preload bridge (Node path semantics)', () => {
    it('uses POSIX semantics on a POSIX platform', () => {
      expect(path.sep).toBe('/');
      expect(path.join('/a', 'b', '../c')).toBe('/a/c');
      expect(path.basename('/a/b/file.sql', '.sql')).toBe('file');
      expect(path.dirname('/a/b/file.sql')).toBe('/a/b');
      expect(path.extname('/a/b/file.SQL')).toBe('.SQL');
      expect(path.parse('/a/b/file.sql').name).toBe('file');
      expect(path.relative('/a/b', '/a/b/c/d')).toBe('c/d');
      expect(path.isAbsolute('/a')).toBe(true);
      expect(path.isAbsolute('C:\\a')).toBe(false);
      // A backslash is a legal filename character on POSIX, not a separator.
      expect(path.basename('/a/we\\ird')).toBe('we\\ird');
    });

    it('uses Windows semantics on win32', () => {
      setMockPlatform('win32');
      expect(path.sep).toBe('\\');
      expect(path.join('C:\\a', 'b', '..\\c')).toBe('C:\\a\\c');
      // Forward slashes are accepted as input and normalized away.
      expect(path.join('C:/a', 'b/c')).toBe('C:\\a\\b\\c');
      expect(path.basename('C:\\a\\b\\file.sql', '.sql')).toBe('file');
      expect(path.basename('C:/a/b/file.sql')).toBe('file.sql');
      expect(path.dirname('C:\\a\\b\\file.sql')).toBe('C:\\a\\b');
      expect(path.relative('C:\\a\\b', 'C:\\a\\b\\c\\d')).toBe('c\\d');
      expect(path.isAbsolute('C:\\a')).toBe(true);
      expect(path.parse('C:\\a\\b\\file.sql')).toEqual(
        nodePath.win32.parse('C:\\a\\b\\file.sql'),
      );
    });

    it('exposes explicit posix/win32 variants regardless of platform', () => {
      expect(path.posix.join('a', 'b')).toBe('a/b');
      expect(path.win32.join('a', 'b')).toBe('a\\b');
      setMockPlatform('win32');
      expect(path.posix.join('a', 'b')).toBe('a/b');
      expect(path.win32.join('a', 'b')).toBe('a\\b');
    });
  });

  describe('platform helpers', () => {
    it('reports the platform exposed by the preload', () => {
      expect(getPlatform()).toBe('linux');
      expect(isLinux()).toBe(true);
      expect(isWindows()).toBe(false);
      expect(isMac()).toBe(false);

      setMockPlatform('win32');
      expect(getPlatform()).toBe('win32');
      expect(isWindows()).toBe(true);
      expect(isLinux()).toBe(false);
    });
  });

  describe('toPosix', () => {
    it('converts backslashes to forward slashes and leaves others alone', () => {
      expect(toPosix('C:\\a\\b\\c.sql')).toBe('C:/a/b/c.sql');
      expect(toPosix('/a/b/c.sql')).toBe('/a/b/c.sql');
      expect(toPosix('models/staging')).toBe('models/staging');
    });
  });

  describe('splitSegments', () => {
    it('splits on the native separator, preserving the root segment', () => {
      expect(splitSegments('/a/b/c.sql')).toEqual(['', 'a', 'b', 'c.sql']);
      expect(splitSegments('/a/b/c.sql').join(path.sep)).toBe('/a/b/c.sql');
    });

    it('normalizes forward slashes on Windows before splitting', () => {
      setMockPlatform('win32');
      expect(splitSegments('C:\\a\\b\\c.sql')).toEqual(['C:', 'a', 'b', 'c.sql']);
      expect(splitSegments('C:/a/b/c.sql')).toEqual(['C:', 'a', 'b', 'c.sql']);
      expect(splitSegments('C:/a/b/c.sql').join(path.sep)).toBe(
        'C:\\a\\b\\c.sql',
      );
    });
  });

  describe('isInside', () => {
    it('is true for the directory itself and its descendants only', () => {
      expect(isInside('/proj', '/proj')).toBe(true);
      expect(isInside('/proj', '/proj/models/x.sql')).toBe(true);
      expect(isInside('/proj', '/proj/../other/x.sql')).toBe(false);
      expect(isInside('/proj', '/other/x.sql')).toBe(false);
      // A sibling whose name merely starts with the parent's name
      expect(isInside('/proj', '/project2/x.sql')).toBe(false);
      // A child whose name starts with '..'
      expect(isInside('/proj', '/proj/..hidden/x.sql')).toBe(true);
    });

    it('works with Windows paths on win32', () => {
      setMockPlatform('win32');
      expect(isInside('C:\\proj', 'C:\\proj\\models\\x.sql')).toBe(true);
      expect(isInside('C:\\proj', 'C:/proj/models/x.sql')).toBe(true);
      expect(isInside('C:\\proj', 'C:\\other\\x.sql')).toBe(false);
      expect(isInside('C:\\proj', 'D:\\proj\\x.sql')).toBe(false);
    });
  });
});
