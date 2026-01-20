module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/src/__tests__/integration/**/*.test.ts',
    '**/src/__tests__/integration/**/*.test.tsx',
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup/jest.integration.setup.ts'],
  moduleDirectories: ['node_modules', 'release/app/node_modules', 'src'],
  moduleNameMapper: {
    'file-icons-js': '<rootDir>/.erb/mocks/file-icons-js.js',
    '^split-pane-react$': '<rootDir>/.erb/mocks/split-pane-react.js',
    '\\.(css|less|sass|scss)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
      '<rootDir>/.erb/mocks/fileMock.js',
  },
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': 'ts-jest',
  },
  testPathIgnorePatterns: ['release/app/dist', '.erb/dll'],
  testTimeout: 30000,
};
