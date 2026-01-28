export const ipcMain = {
  handle: jest.fn(),
  on: jest.fn(),
  once: jest.fn(),
  removeListener: jest.fn(),
  removeAllListeners: jest.fn(),
  removeHandler: jest.fn(),
};

export const ipcRenderer = {
  invoke: jest.fn(),
  on: jest.fn(),
  once: jest.fn(),
  send: jest.fn(),
  removeListener: jest.fn(),
};

export const app = {
  getPath: jest.fn(() => '/mock/app/path'),
  getVersion: jest.fn(() => '0.0.0-test'),
  whenReady: jest.fn(() => Promise.resolve()),
  on: jest.fn(),
  quit: jest.fn(),
  relaunch: jest.fn(),
  exit: jest.fn(),
};

export const BrowserWindow = jest.fn();
export const Menu = { buildFromTemplate: jest.fn(), setApplicationMenu: jest.fn() };
export const dialog = { showOpenDialog: jest.fn(), showSaveDialog: jest.fn(), showMessageBox: jest.fn() };
export const shell = { openExternal: jest.fn() };

export const net = {
  request: jest.fn(),
};

export const IncomingMessage = jest.fn();
