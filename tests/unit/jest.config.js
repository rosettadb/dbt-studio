module.exports = {
  rootDir: '../..',
  testEnvironment: 'jsdom',
  testMatch: ['**/tests/unit/**/*.test.ts', '**/tests/unit/**/*.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/tests/unit/__setup__/jest.setup.ts'],
  moduleDirectories: ['node_modules', 'release/app/node_modules', 'src'],
  moduleNameMapper: {
    'file-icons-js': '<rootDir>/.erb/mocks/file-icons-js.js',
    '^split-pane-react$': '<rootDir>/.erb/mocks/split-pane-react.js',
    '^electron$': '<rootDir>/tests/unit/__setup__/electron.mock.ts',
    '^@databricks/sql$': '<rootDir>/tests/unit/__setup__/databricksSql.mock.ts',
    '^snowflake-sdk$': '<rootDir>/tests/unit/__setup__/snowflakeSdk.mock.ts',
    '^@google-cloud/storage$':
      '<rootDir>/tests/unit/__setup__/googleCloudStorage.mock.ts',
    '^@azure/storage-blob$':
      '<rootDir>/tests/unit/__setup__/azureStorageBlob.mock.ts',
    '^electron-store$': '<rootDir>/tests/unit/__setup__/electronStore.mock.ts',
    '^@ai-sdk/mcp$': '<rootDir>/tests/unit/__setup__/aiSdkMcp.mock.ts',
    '^pkce-challenge$': '<rootDir>/tests/unit/__setup__/aiSdkMcp.mock.ts',
    '\\.(css|less|sass|scss)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
      '<rootDir>/.erb/mocks/fileMock.js',
  },
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': 'ts-jest',
  },
  transformIgnorePatterns: ['/node_modules/(?!(pkce-challenge|@ai-sdk/mcp)/)'],
  testEnvironmentOptions: {
    url: 'http://localhost/',
  },
  modulePathIgnorePatterns: ['<rootDir>/release/app'],
  testPathIgnorePatterns: ['release/app/dist', '.erb/dll'],
  testTimeout: 10000,
  maxWorkers: '50%',
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 75,
      lines: 75,
      statements: 75,
    },
  },
};
