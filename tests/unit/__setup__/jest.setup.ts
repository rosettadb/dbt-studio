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

(global as any).fetch = jest.fn();
process.env.NODE_ENV = 'test';
