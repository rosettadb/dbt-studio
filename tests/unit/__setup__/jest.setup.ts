import '@testing-library/jest-dom';
import { installIpcRendererMock } from './ipcRenderer.mock';

installIpcRendererMock();

(global as any).fetch = jest.fn();
process.env.NODE_ENV = 'test';
