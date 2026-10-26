module.exports = {
  extends: 'erb',
  plugins: ['@typescript-eslint', 'studio'],
  rules: {
    // A temporary hack related to IDE not resolving correct package.json
    'import/no-extraneous-dependencies': 'off',
    'react/react-in-jsx-scope': 'off',
    'react/jsx-filename-extension': 'off',
    'import/extensions': 'off',
    'import/no-unresolved': 'off',
    'import/no-import-module-exports': 'off',
    'no-shadow': 'off',
    '@typescript-eslint/no-shadow': 'error',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'error',
    'import/prefer-default-export': 'off',
    'react-hooks/exhaustive-deps': 'off',
    'react/function-component-definition': 'off',
    'react/require-default-props': 'off',
    'import/no-cycle': 'off',
    'jsx-a11y/label-has-associated-control': 'off',
    'react/no-array-index-key': 'off',
    'import/no-restricted-paths': [
      'error',
      {
        zones: [
          {
            target: [
              './src/renderer/**/*',
              './src/connections/**/*.tsx',
              './src/connections/**/*.renderer.ts',
            ],
            from: ['./src/connections/**/*.main.ts'],
            message: 'Renderer code cannot import main-process connection code.',
          },
          {
            target: ['./src/main/**/*', './src/connections/**/*.main.ts'],
            from: [
              './src/connections/**/*.tsx',
              './src/connections/**/*.renderer.ts',
            ],
            message: 'Main-process code cannot import renderer connection code.',
          },
          {
            target: ['./src/connections/**/*.shared.ts'],
            from: [
              './src/main/**/*',
              './src/renderer/**/*',
              './src/connections/**/*.main.ts',
              './src/connections/**/*.tsx',
              './src/connections/**/*.renderer.ts',
            ],
            message:
              'Shared connection files run in both processes: import only types and other *.shared.ts files.',
          },
        ],
      },
    ],
  },
  overrides: [
    {
      // The renderer must get OS/path facts from src/renderer/lib/path.ts,
      // never by sniffing the browser or reading the raw bridge. The first
      // four entries are airbnb's defaults, repeated because overriding the
      // rule replaces its options instead of merging them.
      files: [
        'src/renderer/**/*.{ts,tsx}',
        'src/connections/**/*.tsx',
        'src/connections/**/*.renderer.ts',
      ],
      excludedFiles: ['src/renderer/lib/path.ts'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: 'ForInStatement',
            message:
              'for..in loops iterate over the entire prototype chain, which is virtually never what you want. Use Object.{keys,values,entries}, and iterate over the resulting array.',
          },
          {
            selector: 'ForOfStatement',
            message:
              'iterators/generators require regenerator-runtime, which is too heavyweight for this guide to allow them. Separately, loops should be avoided in favor of array iterations.',
          },
          {
            selector: 'LabeledStatement',
            message:
              'Labels are a form of GOTO; using them makes code confusing and hard to maintain and understand.',
          },
          {
            selector: 'WithStatement',
            message:
              '`with` is disallowed in strict mode because it makes code impossible to predict and optimize.',
          },
          {
            selector:
              "MemberExpression[object.name='navigator'][property.name=/^(platform|appVersion)$/]",
            message:
              'Do not sniff the OS from navigator. Use isWindows()/isMac()/getPlatform() from src/renderer/lib/path.',
          },
          {
            selector:
              "MemberExpression[property.name='os'][object.property.name='app'][object.object.property.name='electron']",
            message:
              'Do not read window.electron.app.os directly. Use isWindows()/isMac()/getPlatform() or `path` from src/renderer/lib/path.',
          },
        ],
      },
    },
    {
      files: ['src/**/*.{ts,tsx}'],
      excludedFiles: [
        'src/connections/**',
        'src/main/services/duckLake/**',
        'src/renderer/components/dataLake/**',
      ],
      rules: { 'studio/no-connection-type-branch': 'error' },
    },
    {
      files: ['src/connections/**/*.{ts,tsx}'],
      rules: {
        // Connector methods implement a contract; many don't need `this`.
        'class-methods-use-this': 'off',
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      },
    },
    {
      files: ['src/connections/**/*.shared.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              'fs', 'path', 'os', 'child_process', 'electron', 'react', 'pg',
              'snowflake-sdk', '@google-cloud/bigquery', '@databricks/sql',
              '@duckdb/node-api', 'better-sqlite3', 'mysql2', 'mysql2/promise',
              'oracledb', 'keytar',
            ],
            patterns: ['*.png', '*.svg', '*.jpg'],
          },
        ],
      },
    },
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  settings: {
    'import/resolver': {
      // See https://github.com/benmosher/eslint-plugin-import/issues/1396#issuecomment-575727774 for line below
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
        moduleDirectory: ['node_modules', 'src/'],
      },
      webpack: {
        config: require.resolve('./.erb/configs/webpack.config.eslint.ts'),
      },
      typescript: {},
    },
    'import/parsers': {
      '@typescript-eslint/parser': ['.ts', '.tsx'],
    },
  },
};
