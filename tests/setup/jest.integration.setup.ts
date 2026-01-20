// Jest integration setup file
// This file is executed before each test file in the integration test suite

// Set longer timeout for integration tests involved with databases or containers
jest.setTimeout(30000);

// Mock electron if needed globally, but usually specific tests will mock what they need.
// For integration tests, we want to run in Node environment, so we might need to mock some browser APIs if they leak into main process code.
// But mostly we are testing main process services.

// Example: Global teardown or setup can go here
