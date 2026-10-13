import nodePath from 'path';

export type MockPlatform = 'posix' | 'win32';

/**
 * Mirrors the allowlist in src/main/preload.ts, built from Node's real `path`
 * so the renderer's `src/renderer/lib/path.ts` behaves exactly as in the app.
 * Defaults to POSIX so tests are deterministic on every developer OS; call
 * `setMockPlatform('win32')` inside a test to exercise Windows semantics.
 */
const pickPathApi = (p: typeof nodePath) => ({
  join: (...parts: string[]) => p.join(...parts),
  resolve: (...parts: string[]) => p.resolve(...parts),
  normalize: (filePath: string) => p.normalize(filePath),
  isAbsolute: (filePath: string) => p.isAbsolute(filePath),
  relative: (from: string, to: string) => p.relative(from, to),
  dirname: (filePath: string) => p.dirname(filePath),
  basename: (filePath: string, suffix?: string) => p.basename(filePath, suffix),
  extname: (filePath: string) => p.extname(filePath),
  parse: (filePath: string) => p.parse(filePath),
  format: (pathObject: Parameters<typeof nodePath.format>[0]) =>
    p.format(pathObject),
  sep: p.sep,
  delimiter: p.delimiter,
});

const buildPathBridge = (platform: MockPlatform) => ({
  ...pickPathApi(platform === 'win32' ? nodePath.win32 : nodePath.posix),
  posix: pickPathApi(nodePath.posix),
  win32: pickPathApi(nodePath.win32),
});

export const setMockPlatform = (platform: MockPlatform) => {
  (window as any).electron.path = buildPathBridge(platform);
  (window as any).electron.app.os = platform === 'win32' ? 'win32' : 'linux';
};

export const installIpcRendererMock = () => {
  (window as any).electron = {
    ipcRenderer: {
      sendMessage: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      removeListener: jest.fn(),
      invoke: jest.fn(),
    },
    app: {
      version: '0.0.0-test',
      os: 'linux',
      arch: 'x64',
      isDebug: false,
    },
    path: buildPathBridge('posix'),
  };
};
