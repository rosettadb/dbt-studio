// Jest integration setup file
// This file is executed before each test file in the integration test suite

// Add Node.js polyfills for APIs that might be missing in test environment
import 'openai/shims/node';
import { TextEncoder, TextDecoder } from 'util';

// Polyfill TextEncoder/TextDecoder for Node.js if not available
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder as any;
  global.TextDecoder = TextDecoder as any;
}

// Set longer timeout for integration tests involved with databases or containers
jest.setTimeout(30000);

// Mock electron if needed globally, but usually specific tests will mock what they need.
// For integration tests, we want to run in Node environment, so we might need to mock some browser APIs if they leak into main process code.
// But mostly we are testing main process services.

// Example: Global teardown or setup can go here
process.env.NODE_ENV = 'test';
