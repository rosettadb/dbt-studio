# Integration Testing Guide

This directory contains integration tests for dbt Studio. These tests are designed to validate the interaction between different layers of the backend (Main Process) without launching the full Electron application window.

## ✅ Completed Phases

### Phase 2.1: Main Database Service ✅ COMPLETE
- **Tests**: 29 tests, 100% passing
- **Coverage**: AI Providers, Conversations, Messages, Templates, Usage Analytics, Database Management
- **File**: `tests/integration/services/mainDatabase.service.test.ts`

## 🚀 Running Tests

```bash
# Run all integration tests
npm run test:integration

# Run only Phase 2.1 (mainDatabase service tests)
npm run test:integration -- tests/integration/services/mainDatabase.service.test.ts

# Watch mode
npm run test:integration:watch

# Validation with coverage
npm run test:integration:coverage
```

## 🏗 Infrastructure & Configuration

- **Config**: `jest.integration.config.js`
- **Environment**: Node.js (`testEnvironment: 'node'`) - NOT `jsdom`. This is crucial for testing backend services that interact with the file system and native modules.
- **Setup**: `tests/setup/jest.integration.setup.ts`
- **Timeout**: Extended to 30s to accommodate DB operations and potential container startups.

### ⚠️ Important: Native Modules (`better-sqlite3`)

dbt Studio uses `better-sqlite3` which is a native module. In the production app, this is rebuilt for Electron. However, for integration tests running in a standard Node.js environment, we need a standard Node.js build of the module.

### 🐳 Docker Requirement

PostgreSQL Connector tests (`tests/integration/lib/db/postgres.test.ts`) use `testcontainers` which requires a running Docker environment. Ensure the `docker` CLI is in your path and the daemon is running. If Docker is not available, these tests will fail with connection errors.

**Testcontainers** automatically manages container lifecycle (start/stop) for each test run. However, if you need to manually create a PostgreSQL container for debugging or development:

```bash
# Create and start a PostgreSQL container
docker run --name manual-postgres-test \
  -e POSTGRES_PASSWORD=testpassword \
  -e POSTGRES_USER=testuser \
  -e POSTGRES_DB=testdb \
  -d -p 5432:5432 postgres:14

# Stop the container
docker stop manual-postgres-test

# Remove the container
docker rm manual-postgres-test
```

**Note:** The integration tests use `postgres:14` image. Make sure this image is available locally or can be pulled from Docker Hub.

**The Solution:**
1. We install `better-sqlite3` as a `devDependency`.
2. `jest.integration.config.js` forces resolution to `<rootDir>/node_modules/better-sqlite3` (the Node version) instead of `release/app/node_modules` (the Electron version).

```javascript
moduleNameMapper: {
  // ...
  '^better-sqlite3$': '<rootDir>/node_modules/better-sqlite3',
},
```

## 📂 Directory Structure

```
tests/integration/
├── ipc/                    # IPC handler tests (Controller <-> IPC <-> Service)
├── services/               # Backend service integration tests
│   └── mainDatabase.service.test.ts ✅ (29 tests)
├── lib/
│   └── db/                 # Database driver tests (Postgres, DuckDB, etc.)
├── fixtures/               # Test data and static assets
└── utils/                  # Test helpers (IPC mocks, etc.)
```

## 🧪 Writing Integration Tests

### Service Tests
Test services in isolation from the UI but with real file system / DB side effects (in temp dirs).

**Pattern:**
1. **Mock Electron**: Mock `app.getPath` and other Electron APIs that services depend on.
2. **Temp Directory**: Create a unique temp directory for each test suite to avoid conflicts.
3. **Cleanup**: Always clean up temp directories and close database connections in `afterAll` / `afterEach`.
4. **No Conditional Expects**: Avoid wrapping expects in if statements. Use `beforeEach` to set up required data.

```typescript
// Example Setup
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn().mockReturnValue('/tmp/test-dir'),
  },
}));

beforeAll(() => {
  // Create temp dir
});

afterAll(() => {
  // Service.close();
  // Delete temp dir
});

// ✅ GOOD: Use beforeEach to ensure data exists
beforeEach(async () => {
  const provider = await MainDatabaseService.saveProvider({...});
  providerId = provider.id;
});

it('should use the provider', async () => {
  expect(providerId).toBeDefined(); // Always runs
  const result = await service.getProvider(providerId);
  expect(result).toBeDefined();
});

// ❌ BAD: Conditional expects fail ESLint checks
it('bad test', async () => {
  const data = await service.getData();
  if (data.length > 0) {
    expect(data[0]).toBeDefined(); // ESLint error!
  }
});
```

### IPC Tests
Use `tests/integration/utils/ipc-mock.ts` to mock `ipcMain` and test that handlers correctly invoke services.

## 📝 Best Practices

1. **Isolation**: Tests should not depend on shared state. Use unique paths or clean databases.
2. **Teardown**: Ensure DB connections are closed (`MainDatabaseService.close()`) to prevent locking files.
3. **Mocking**: Only mock the boundary to the OS/UI if necessary. Prefer real interactions with SQLite/DuckDB where possible for true integration confidence.
4. **Imports**: Use relative imports or proper aliases. If using aliases, ensure they are mapped in `jest.integration.config.js`.
5. **Foreign Keys**: When testing services that reference other entities (e.g., `providerId`), create those entities in `beforeEach` to satisfy constraints.
6. **Property Names**: Verify schema definitions before writing tests. Use actual field names (e.g., `template` not `prompt` for templates).

## 🎯 Phase Completion Checklist

- [x] **Phase 2.1** - Main Database Service Integration Tests (29 tests)
  - [x] AI Provider Management (7 tests)
  - [x] Conversation Management (6 tests)
  - [x] Chat Message Management (5 tests)
  - [x] Prompt Template Management (5 tests)
  - [x] Usage Analytics (3 tests)
  - [x] Database Management (3 tests)

- [ ] **Phase 2.2** - DuckDB Service Integration Tests
- [ ] **Phase 2.3** - PostgreSQL Connector with Testcontainers
- [ ] **Phase 3** - IPC Handler Integration Tests
- [ ] **Phase 4** - Cloud Service Integration Tests
- [ ] **Phase 5** - Git Service Integration Tests
- [ ] **Phase 6** - AI Provider Integration Tests
- [ ] **Phase 7** - CI/CD Pipeline Integration
