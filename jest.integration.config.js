const baseConfig = require('./package.json').jest;

module.exports = {
  ...baseConfig,
  testMatch: ['**/tests/integration/**/*.test.ts'],
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup/jest.integration.setup.ts'],
  testTimeout: 30000,
  maxWorkers: 1,
  moduleNameMapper: {
    ...baseConfig.moduleNameMapper,
    '^@services/(.*)$': '<rootDir>/src/main/services/$1',
    '^@ipc/(.*)$': '<rootDir>/src/main/ipcHandlers/$1',
    '^@schemas/(.*)$': '<rootDir>/src/main/schemas/$1',
    '^better-sqlite3$': '<rootDir>/node_modules/better-sqlite3',
    '^electron-store$': '<rootDir>/tests/integration/mocks/electron-store.ts',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
        diagnostics: {
          ignoreCodes: [151001],
        },
      },
    ],
  },
};
