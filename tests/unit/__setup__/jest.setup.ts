import '@testing-library/jest-dom';
import 'openai/shims/node';
import { TextDecoder, TextEncoder } from 'util';
import { installIpcRendererMock } from './ipcRenderer.mock';

installIpcRendererMock();

if (!(global as any).TextEncoder) {
  (global as any).TextEncoder = TextEncoder;
}

if (!(global as any).TextDecoder) {
  (global as any).TextDecoder = TextDecoder;
}

// Add TransformStream polyfill for AI SDK v6
if (!(global as any).TransformStream) {
  const { TransformStream } = require('stream/web');
  (global as any).TransformStream = TransformStream;
}

// jsdom (v20 here) doesn't have structuredClone (added in jsdom v21).
// Production runs in the Electron main process (plain Node), where the
// real global is always present.
if (!(global as any).structuredClone) {
  // eslint-disable-next-line global-require
  const v8 = require('v8');
  (global as any).structuredClone = (value: unknown) =>
    v8.deserialize(v8.serialize(value));
}

(global as any).fetch = jest.fn();
process.env.NODE_ENV = 'test';
