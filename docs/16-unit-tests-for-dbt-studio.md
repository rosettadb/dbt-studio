# Unit Testing Plan for DBT Studio

**Status**: Draft Planning Document  
**Created**: January 2026  
**Target Application**: DBT Studio (Electron + React + TypeScript)

---

## Executive Summary

This document provides a comprehensive unit testing strategy for **DBT Studio**, an Electron application that provides a comprehensive interface for managing dbt projects, database connections, cloud data exploration, and data analytics workflows with advanced AI integration.

The plan is built on analysis of:
- **General Electron testing guidelines** - Core principles for testable Electron architecture
- **Integration testing best practices** - Real-world patterns from Beekeeper Studio & Joplin
- **DBT Studio codebase structure** - Existing project organization and test infrastructure

### Key Principle

> **Unit Testing = 90% Architecture, 10% Tooling**

DBT Studio is well-positioned for effective unit testing due to its layered architecture: Renderer (React) → Controllers (React Hooks) → Services (Business Logic) → IPC Handlers (Electron wiring) → Backend Services (Main Process).

---

## Test Strategy Overview: Three-Layer Approach

DBT Studio uses a **three-layer testing strategy** with clear separation of concerns:

### 📋 Test Pyramid

```
                ┌─────────────┐
                │    E2E      │  Playwright (User workflows)
                │  Tests (5%) │  File: docs/ai-context/plans/014-plan-dbt-studio-e2e-playwight-testing.md
                ├─────────────┤
                │ Integration │  Jest (Services + IPC + DB)
                │  Tests (15%)│  File: 15-integrations-tests-for-dbt-studio.md
                ├─────────────┤
                │    Unit     │  Jest (Pure logic + Components)
                │ Tests (80%) │  File: 16-unit-tests-for-dbt-studio.md (THIS DOCUMENT)
                └─────────────┘
```

### 🎯 Clear Boundaries

| Layer | Scope | Tools | Dependencies | File Reference |
|-------|-------|-------|--------------|-----------------|
| **Unit** | Pure functions, isolated services, components | Jest + jsdom | ✅ All mocked | **THIS DOCUMENT** |
| **Integration** | Service interactions, IPC contracts, real databases | Jest + Node env | ⚠️ Real (testcontainers) | [15-integrations-tests](./15-integrations-tests-for-dbt-studio.md) |
| **E2E** | Complete user workflows, UI interactions | Playwright | ❌ Full app running | [014-plan-e2e](./docs/ai-context/plans/014-plan-dbt-studio-e2e-playwight-testing.md) |

### 🚫 What This Document Does NOT Cover

**These belong in other test files:**

- ❌ Testing with real databases → Use **integration tests** (testcontainers)
- ❌ Testing IPC channel communication end-to-end → Use **integration tests** 
- ❌ Testing UI workflows through Playwright → Use **E2E tests**
- ❌ Testing Electron APIs (BrowserWindow, app, ipcMain) → Use **integration tests** with mocks
- ❌ Testing complete user journeys → Use **E2E tests**

### ✅ What This Document DOES Cover

**Pure unit test scenarios:**

- ✅ Pure utility functions (formatters, validators, transformers)
- ✅ Service business logic with **mocked** dependencies
- ✅ React components with **mocked** services
- ✅ React hooks with **mocked** service calls
- ✅ Schema validation (Zod)
- ✅ IPC handler wiring (verify registration, not actual invocation)
- ✅ Type safety and interfaces

---

## Part 1: Testing Scope & Boundaries

### 1.0 When to Write Each Type of Test

Use this decision tree to determine where your test belongs:

**Question 1: Does the test call a real database or external service?**
- **YES** → Write an **Integration Test** (uses testcontainers/mocks of APIs)
- **NO** → Go to Question 2

**Question 2: Does the test start the Electron app or require IPC communication?**
- **YES** → Write an **E2E Test** (Playwright)
- **NO** → Go to Question 3

**Question 3: Does the test exercise business logic in isolation?**
- **YES** → Write a **Unit Test** (this document)
- **NO** → You might not need this test

### Examples

| Scenario | Test Type | Why |
|----------|-----------|-----|
| Testing `formatQueryTime(1500)` returns `'1.5s'` | **Unit** | Pure function, no dependencies |
| Testing `ConnectionService.create()` with mocked DB | **Unit** | Service logic isolated, all deps mocked |
| Testing `ConnectionForm` component rendering | **Unit** | Component in isolation, services mocked |
| Testing connection creation through IPC with real validation | **Integration** | Tests IPC handler + real business logic |
| Testing database connector against real PostgreSQL | **Integration** | Needs testcontainer with real DB |
| Testing user can create connection, run query, export results | **E2E** | Complete workflow through UI |

### Cross-Reference Guide

**If you need to test:**

| Requirement | See Document | Reason |
|-------------|--------------|--------|
| Pure functions (utils, helpers) | THIS DOCUMENT | Unit test scope |
| Service business logic | THIS DOCUMENT (with mocks) | Unit tests with mocked adapters |
| React components | THIS DOCUMENT | Unit tests with mocked services |
| Service with real database | [Integration Tests](./15-integrations-tests-for-dbt-studio.md) | Needs testcontainer |
| IPC handler communication | [Integration Tests](./15-integrations-tests-for-dbt-studio.md) | Tests actual IPC flow |
| Complete user workflows | [E2E Tests](./docs/ai-context/plans/014-plan-dbt-studio-e2e-playwight-testing.md) | Playwright tests |
| Electron app lifecycle | [E2E Tests](./docs/ai-context/plans/014-plan-dbt-studio-e2e-playwight-testing.md) | App startup, windows, etc |

### Integration Test Status (Phase 2 - Completed ✅)

The following integration tests have been successfully implemented:

- ✅ **MainDatabaseService** (SQLite) - 3 tests passing
  - AI Provider management (save, retrieve, list)
  - Conversation management (create)
  - Database isolation with temporary test databases

- ✅ **DuckDBService** - 4 tests passing
  - Database file creation and initialization
  - Connection pooling and release
  - Query execution with `withConnection` helper
  - Singleton state management with `reinitialize()`

- ✅ **PostgreSQL Connector** - 4 tests passing
  - Connection testing with real PostgreSQL container (testcontainers)
  - Authentication failure handling
  - Query execution (CREATE, INSERT, SELECT)
  - Error handling for invalid queries

**Total**: 11 integration tests passing across 3 test suites

For details, see [Integration Tests Documentation](./15-integrations-tests-for-dbt-studio.md)

---

## Part 1: Current State Analysis

### 1.1 Existing Test Infrastructure

**Available Tools:**
- ✅ Jest v29.7.0 (with ts-jest transformer)
- ✅ TypeScript support (ts-jest)
- ✅ Testing Library (@testing-library/react, @testing-library/jest-dom)
- ✅ React Test Renderer
- ✅ TestContainers for containerized tests
- ✅ AWS SDK Client Mock

**Existing Configuration:**
- Base Jest config in `package.json`
- Integration test config: `jest.integration.config.js`
- Environment setup file: `tests/setup/jest.integration.setup.ts`
- Integration tests organized in `tests/integration/`

**Test Commands:**
```bash
npm run test                      # Unit tests (Jest default)
npm run test:integration         # Integration tests with Node environment
npm run test:integration:watch   # Watch mode for integration tests
npm run test:integration:coverage # Coverage report for integration tests
```

### 1.2 Project Architecture (Testing-Relevant)

**Renderer Layer** (`src/renderer/`):
- Components: UI building blocks
- Controllers: React hooks wrapping service calls
- Services: IPC invocation wrappers
- Hooks: Custom React hooks for state management
- Utils: Pure helper functions

**Main Process Layer** (`src/main/`):
- `ipcHandlers/`: Thin IPC channel handlers (7-step flow)
- `ipcSetup.ts`: Central IPC handler registration
- `services/`: Business logic implementation
- `adapters/`: External integrations (databases, cloud storage, AI)
- `schemas/`: Zod validation schemas
- `utils/`: Pure utility functions

**Shared Logic** (`src/types/`):
- TypeScript types used across renderer/main boundary
- IPC channel contracts and payloads

### 1.3 Critical Architecture Pattern: 7-Step Electron Flow

Every feature in DBT Studio follows this flow:

```
1. Frontend Service (src/renderer/services/*)
   ↓ (invokes IPC channel)
2. Frontend Controller (src/renderer/controllers/*)
   ↓ (uses React Query for state)
3. IPC Handler (src/main/ipcHandlers/*)
   ↓ (thin wrapper, NO logic)
4. Handler Index (src/main/ipcHandlers/index.ts)
   ↓ (exports handler registration)
5. IPC Setup (src/main/ipcSetup.ts)
   ↓ (calls all handler registration)
6. Backend Service (src/main/services/*)
   ↓ (actual business logic)
7. Main Integration (service dependencies)
```

**This pattern is critical for unit testing**: Each layer can be tested in isolation.

### 1.4 Current Test Gaps

**What exists:**
- Integration test infrastructure
- Test utilities and fixtures
- Mock patterns for AWS, databases

**What's missing:**
- **Unit test suite for pure functions** (80% of ideal unit test coverage)
- **Renderer component unit tests** (Controllers + Components)
- **Service layer unit tests** (Business logic isolation)
- **IPC handler validation tests** (Contract testing)
- **Comprehensive mock setup** (Electron APIs)
- **Test configuration for unit tests** (`jest.config.js` for jsdom environment)

---

## Part 2: Unit Testing Strategy

### 2.1 Test Pyramid for DBT Studio

```
              ┌─────────────┐
              │    E2E      │  Playwright/Spectron
              │  Tests (5%) │  Full app workflows
              ├─────────────┤
              │ Integration │  TestContainers + Node env
              │  Tests (15%)│  IPC + Services + External APIs
              ├─────────────┤
              │    Unit     │  Jest + ts-jest + jsdom
              │ Tests (80%) │  Pure functions + Services + Components
              └─────────────┘
```

**Unit Tests Should Cover:**
- Pure utility functions (100% coverage target)
- Service business logic (95% coverage target)
- React components & controllers (80% coverage target)
- IPC handler registration (90% coverage target)

### 2.2 Test Organization Structure

```
tests/
├── unit/                              # NEW: Unit test suite
│   ├── __setup__/
│   │   ├── electron.mock.ts           # Mock Electron APIs globally
│   │   ├── jest.setup.ts              # Global test setup
│   │   └── README.md                  # Setup documentation
│   │
│   ├── renderer/
│   │   ├── services/
│   │   │   ├── connection.service.test.ts
│   │   │   ├── project.service.test.ts
│   │   │   ├── ai.service.test.ts
│   │   │   └── README.md
│   │   ├── controllers/
│   │   │   ├── connection.controller.test.ts
│   │   │   ├── project.controller.test.ts
│   │   │   └── README.md
│   │   ├── hooks/
│   │   │   ├── useQuery.test.ts
│   │   │   ├── useMutation.test.ts
│   │   │   └── README.md
│   │   └── components/
│   │       ├── ConnectionForm.test.tsx
│   │       ├── QueryEditor.test.tsx
│   │       └── README.md
│   │
│   ├── main/
│   │   ├── services/
│   │   │   ├── connection.service.test.ts
│   │   │   ├── project.service.test.ts
│   │   │   ├── datalake.service.test.ts
│   │   │   ├── git.service.test.ts
│   │   │   ├── settings.service.test.ts
│   │   │   ├── ai-provider.service.test.ts
│   │   │   └── README.md
│   │   ├── ipcHandlers/
│   │   │   ├── connection.ipcHandlers.test.ts
│   │   │   ├── project.ipcHandlers.test.ts
│   │   │   ├── ai.ipcHandlers.test.ts
│   │   │   └── README.md
│   │   ├── schemas/
│   │   │   ├── connection.schema.test.ts
│   │   │   ├── project.schema.test.ts
│   │   │   └── README.md
│   │   └── utils/
│   │       ├── path-resolver.test.ts
│   │       ├── environment.test.ts
│   │       └── README.md
│   │
│   ├── shared/
│   │   ├── utils/
│   │   │   ├── formatters.test.ts
│   │   │   ├── validators.test.ts
│   │   │   ├── data-transform.test.ts
│   │   │   └── README.md
│   │   └── types/
│   │       ├── validation.test.ts
│   │       └── README.md
│   │
│   └── jest.config.js                 # Unit test configuration (jsdom)
│
├── integration/                        # EXISTING: Integration test suite
│   ├── ipc/
│   ├── services/
│   ├── lib/
│   ├── README.md
│   └── jest.config.js                 # Integration config (node env)
│
├── setup/
│   └── jest.integration.setup.ts       # EXISTING
│
├── fixtures/                           # EXISTING: Test data
│   ├── connections/
│   ├── projects/
│   ├── clouds/
│   └── README.md
│
└── mocks/                              # NEW: Mock implementations
    ├── ipcRenderer.mock.ts            # window.electron mock
    ├── electron.mock.ts               # electron module mock
    ├── database.mock.ts               # Database adapters mock
    ├── cloud-storage.mock.ts          # Cloud storage mock
    ├── ai-providers.mock.ts           # AI provider mock
    └── README.md
```

### 2.3 Jest Configuration Strategy

#### A. Unit Test Configuration (`tests/unit/jest.config.js`)

```typescript
module.exports = {
  // Environment: jsdom for renderer tests, node for pure functions
  testEnvironment: 'jsdom',
  
  // Match unit test files
  testMatch: ['**/tests/unit/**/*.test.ts', '**/tests/unit/**/*.test.tsx'],
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/tests/unit/__setup__/jest.setup.ts',
  ],
  
  // Module resolution
  moduleNameMapper: {
    // Mocks
    '^@mocks/(.*)$': '<rootDir>/tests/mocks/$1',
    '^electron$': '<rootDir>/tests/mocks/electron.mock.ts',
    
    // Aliases (from tsconfig)
    '^@main/(.*)$': '<rootDir>/src/main/$1',
    '^@renderer/(.*)$': '<rootDir>/src/renderer/$1',
    '^@types/(.*)$': '<rootDir>/src/types/$1',
    
    // Asset mocks
    '\\.(css|less|sass|scss)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif)$': '<rootDir>/tests/mocks/fileMock.js',
  },
  
  // Transform
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }],
  },
  
  // Test timeout
  testTimeout: 10000,
  
  // Workers
  maxWorkers: '50%',
  
  // Coverage
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
```

#### B. Integration Test Configuration (Existing)

No changes needed. Integration tests continue to:
- Use `node` environment (not jsdom)
- Test IPC channels, services with external deps
- Use TestContainers for database testing
- Run with `--runInBand` for serial execution

### 2.4 Mocking Strategy

#### A. Global Mocks (`tests/unit/__setup__/`)

**1. Electron Module Mock** (`electron.mock.ts`):
```typescript
// Mock all Electron APIs used by main process
export const ipcMain = {
  handle: jest.fn(),
  on: jest.fn(),
  invoke: jest.fn(),
};

export const app = {
  getPath: jest.fn(() => '/mock/app/path'),
  getVersion: jest.fn(() => '1.0.0'),
  whenReady: jest.fn(() => Promise.resolve()),
};

export const BrowserWindow = jest.fn();
export const Menu = { buildFromTemplate: jest.fn() };
// ... more mocks as needed
```

**2. IPC Renderer Mock** (`ipcRenderer.mock.ts`):
```typescript
// Mock window.electron.ipcRenderer for renderer process
window.electron = {
  ipcRenderer: {
    invoke: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    send: jest.fn(),
    removeListener: jest.fn(),
  },
};
```

**3. Global Setup** (`jest.setup.ts`):
```typescript
// Setup global mocks and environment variables
import '@mocks/electron.mock';
import '@mocks/ipcRenderer.mock';

global.fetch = jest.fn();
process.env.NODE_ENV = 'test';
process.env.SKIP_PREFLIGHT_CHECK = 'true';
```

#### B. Feature-Specific Mocks

**Database Adapter Mock** (`tests/mocks/database.mock.ts`):
```typescript
export const mockDatabaseAdapter = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  query: jest.fn(),
  getSchema: jest.fn(),
};
```

**Cloud Storage Mock** (`tests/mocks/cloud-storage.mock.ts`):
```typescript
export const mockS3 = {
  listObjects: jest.fn(),
  getObject: jest.fn(),
  putObject: jest.fn(),
};
```

**AI Provider Mock** (`tests/mocks/ai-providers.mock.ts`):
```typescript
export const mockOpenAI = {
  createCompletion: jest.fn(),
  createMessage: jest.fn(),
};

export const mockAnthropic = {
  messages: {
    create: jest.fn(),
  },
};
```

---

## Part 3: Unit Testing by Layer

### 3.0 Pre-Implementation Checklist: Is This a Unit Test?

Before writing a test in this document, verify:

- [ ] **No real dependencies**: Database, file system, network all mocked?
- [ ] **No Electron startup**: App doesn't launch, just services run?
- [ ] **Under 1 second execution**: Test completes quickly (not waiting for containers)?
- [ ] **Isolated logic**: Tests one component/service in isolation?
- [ ] **Mocks are clean**: Mocking only adapters/boundaries, not business logic?

**If any are NO:**
- Can't execute without container? → **Integration Test**
- Needs app to run? → **E2E Test**  
- Too slow or flaky? → **Integration Test**

---

### 3.1 Renderer Layer Testing

#### 3.1.1 Service Layer Tests (IPC Wrappers)

**File**: `tests/unit/renderer/services/connection.service.test.ts`

```typescript
describe('Connection Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createConnection', () => {
    it('should invoke the create-connection IPC channel', async () => {
      const mockInvoke = jest.fn().mockResolvedValue({ id: '123' });
      window.electron.ipcRenderer.invoke = mockInvoke;

      const result = await connectionService.createConnection({
        name: 'test',
        type: 'postgres',
      });

      expect(mockInvoke).toHaveBeenCalledWith(
        'connection:create',
        expect.objectContaining({ name: 'test', type: 'postgres' })
      );
      expect(result.id).toBe('123');
    });

    it('should handle IPC errors gracefully', async () => {
      const error = new Error('Connection failed');
      window.electron.ipcRenderer.invoke = jest.fn().mockRejectedValue(error);

      await expect(connectionService.createConnection({}))
        .rejects.toThrow('Connection failed');
    });
  });
});
```

**Pattern**: 
- Mock `window.electron.ipcRenderer.invoke`
- Verify channel name and payload
- Test success and error paths
- Focus on service interface, not implementation

#### 3.1.2 Controller Hook Tests (React Hooks)

**File**: `tests/unit/renderer/controllers/connection.controller.test.ts`

```typescript
describe('useCreateConnection Hook', () => {
  it('should call the service and update state', async () => {
    const { result } = renderHook(() => useCreateConnection());

    await act(async () => {
      await result.current.createConnection({
        name: 'test',
        type: 'postgres',
      });
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.connection).toBeDefined();
  });

  it('should handle errors and set error state', async () => {
    const { result } = renderHook(() => useCreateConnection());

    await act(async () => {
      try {
        await result.current.createConnection({});
      } catch (e) {
        // Expected
      }
    });

    expect(result.current.error).toBeDefined();
  });
});
```

**Pattern**:
- Use `renderHook` from React Testing Library
- Test hook state transitions
- Mock underlying services
- Verify React Query integration

#### 3.1.3 Component Unit Tests

**File**: `tests/unit/renderer/components/ConnectionForm.test.tsx`

```typescript
describe('ConnectionForm Component', () => {
  it('should render form fields', () => {
    const { getByLabelText } = render(<ConnectionForm onSubmit={jest.fn()} />);

    expect(getByLabelText('Connection Name')).toBeInTheDocument();
    expect(getByLabelText('Database Type')).toBeInTheDocument();
  });

  it('should call onSubmit with form data', async () => {
    const onSubmit = jest.fn();
    const { getByText, getByLabelText } = render(
      <ConnectionForm onSubmit={onSubmit} />
    );

    await userEvent.type(getByLabelText('Connection Name'), 'my-postgres');
    await userEvent.click(getByText('Create Connection'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'my-postgres' })
    );
  });

  it('should display validation errors', async () => {
    const { getByText, getByLabelText } = render(<ConnectionForm />);

    await userEvent.click(getByText('Create Connection'));

    expect(getByText(/Name is required/i)).toBeInTheDocument();
  });
});
```

**Pattern**:
- Test user interactions with `userEvent`
- Verify rendered output with queries
- Test form validation and submission
- Mock callbacks (onSubmit, onChange)

#### 3.1.4 Utility Function Tests

**File**: `tests/unit/renderer/helpers/formatters.test.ts`

```typescript
describe('Query Formatters', () => {
  describe('formatQueryTime', () => {
    it('should format milliseconds to human-readable time', () => {
      expect(formatQueryTime(1500)).toBe('1.5s');
      expect(formatQueryTime(50)).toBe('50ms');
      expect(formatQueryTime(65000)).toBe('1m 5s');
    });
  });

  describe('formatQueryResult', () => {
    it('should format result set correctly', () => {
      const result = formatQueryResult({
        rows: 1000,
        columns: ['id', 'name'],
      });

      expect(result.summary).toContain('1000 rows');
      expect(result.summary).toContain('2 columns');
    });
  });
});
```

**Pattern**:
- Pure function testing (no mocks needed)
- Parametrized tests for multiple cases
- Focus on business logic, not implementation details

### 3.2 Main Process Layer Testing

#### 3.2.1 IPC Handler Tests

**File**: `tests/unit/main/ipcHandlers/connection.ipcHandlers.test.ts`

```typescript
describe('Connection IPC Handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should register create-connection handler', () => {
    const ipcMainMock = require('electron').ipcMain;
    
    registerConnectionHandlers();

    expect(ipcMainMock.handle).toHaveBeenCalledWith(
      'connection:create',
      expect.any(Function)
    );
  });

  describe('create-connection handler', () => {
    it('should call ConnectionService.create with params', async () => {
      const mockCreate = jest.spyOn(ConnectionService, 'create')
        .mockResolvedValue({ id: '123' });

      const handler = getIpcHandler('connection:create');
      const result = await handler(null, { name: 'test', type: 'postgres' });

      expect(mockCreate).toHaveBeenCalledWith({
        name: 'test',
        type: 'postgres',
      });
      expect(result.id).toBe('123');
    });

    it('should propagate service errors', async () => {
      jest.spyOn(ConnectionService, 'create')
        .mockRejectedValue(new Error('Invalid config'));

      const handler = getIpcHandler('connection:create');

      await expect(handler(null, {}))
        .rejects.toThrow('Invalid config');
    });
  });
});
```

**Pattern**:
- Verify handler registration (no logic test)
- Mock service layer
- Test error propagation
- Keep handler tests thin (verify wiring only)

#### 3.2.2 Service Business Logic Tests

**File**: `tests/unit/main/services/connection.service.test.ts`

```typescript
describe('ConnectionService', () => {
  describe('createConnection', () => {
    it('should validate connection config', async () => {
      await expect(
        ConnectionService.create({ name: '', type: 'postgres' })
      ).rejects.toThrow('Connection name is required');
    });

    it('should test database connection before creating', async () => {
      const mockTestConnection = jest.fn().mockResolvedValue(true);
      DatabaseAdapter.testConnection = mockTestConnection;

      await ConnectionService.create({
        name: 'test-db',
        type: 'postgres',
        host: 'localhost',
        port: 5432,
        database: 'mydb',
      });

      expect(mockTestConnection).toHaveBeenCalled();
    });

    it('should store encrypted credentials', async () => {
      const mockStoreSecure = jest.fn();
      SecureStorage.store = mockStoreSecure;

      await ConnectionService.create({
        name: 'test-db',
        type: 'postgres',
        password: 'secret123',
      });

      expect(mockStoreSecure).toHaveBeenCalledWith(
        expect.stringContaining('test-db'),
        'secret123'
      );
    });

    it('should return connection metadata without credentials', async () => {
      const result = await ConnectionService.create({
        name: 'test-db',
        type: 'postgres',
        password: 'secret123',
      });

      expect(result.password).toBeUndefined();
      expect(result.name).toBe('test-db');
    });
  });

  describe('listConnections', () => {
    it('should return all stored connections', async () => {
      // Mock database/storage retrieval
      const mockConnections = [
        { id: '1', name: 'prod-db', type: 'postgres' },
        { id: '2', name: 'dev-db', type: 'mysql' },
      ];
      
      // Setup mock
      jest.spyOn(Database, 'getConnections')
        .mockResolvedValue(mockConnections);

      const result = await ConnectionService.listConnections();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('prod-db');
    });
  });

  describe('deleteConnection', () => {
    it('should remove connection and associated credentials', async () => {
      const mockDelete = jest.fn();
      const mockSecureDelete = jest.fn();
      
      Database.deleteConnection = mockDelete;
      SecureStorage.delete = mockSecureDelete;

      await ConnectionService.deleteConnection('123');

      expect(mockDelete).toHaveBeenCalledWith('123');
      expect(mockSecureDelete).toHaveBeenCalled();
    });

    it('should fail if connection has active queries', async () => {
      jest.spyOn(QueryService, 'hasActiveQueries')
        .mockResolvedValue(true);

      await expect(ConnectionService.deleteConnection('123'))
        .rejects.toThrow('Connection has active queries');
    });
  });
});
```

**Pattern**:
- Test business logic in isolation
- Mock external dependencies (database, storage, adapters)
- Test all code paths (success, validation errors, edge cases)
- Focus on behavior, not implementation

#### 3.2.3 Schema Validation Tests

**File**: `tests/unit/main/schemas/connection.schema.test.ts`

```typescript
describe('Connection Schema', () => {
  describe('CreateConnectionSchema', () => {
    it('should validate correct connection config', () => {
      const config = {
        name: 'my-database',
        type: 'postgres',
        host: 'localhost',
        port: 5432,
        database: 'mydb',
        username: 'user',
        password: 'pass',
      };

      const result = CreateConnectionSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject invalid database type', () => {
      const result = CreateConnectionSchema.safeParse({
        name: 'test',
        type: 'invalid-db',
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toContain('type');
    });

    it('should reject missing required fields', () => {
      const result = CreateConnectionSchema.safeParse({});

      expect(result.success).toBe(false);
      expect(result.error?.issues.length).toBeGreaterThan(0);
    });

    it('should coerce port to number', () => {
      const result = CreateConnectionSchema.safeParse({
        name: 'test',
        type: 'postgres',
        port: '5432',
      });

      expect(result.data?.port).toBe(5432);
      expect(typeof result.data?.port).toBe('number');
    });
  });
});
```

**Pattern**:
- Test Zod schemas directly
- Test validation success paths
- Test failure cases with specific error checking
- Test type coercion and defaults

#### 3.2.4 Utility Function Tests

**File**: `tests/unit/main/utils/environment.test.ts`

```typescript
describe('Environment Utils', () => {
  describe('getProjectPath', () => {
    it('should return expanded project path', () => {
      const path = getProjectPath('~/my-project/dbt_packages');
      expect(path).not.toContain('~');
      expect(path).toContain(process.env.HOME);
    });

    it('should handle absolute paths', () => {
      const absPath = '/Users/test/project';
      const result = getProjectPath(absPath);
      expect(result).toBe(absPath);
    });
  });

  describe('resolveCLIPath', () => {
    it('should find dbt CLI in PATH', async () => {
      // Mock child_process.which
      const mockWhich = jest.fn().mockResolvedValue('/usr/local/bin/dbt');

      const result = await resolveCLIPath('dbt');
      expect(result).toBe('/usr/local/bin/dbt');
    });

    it('should throw if CLI not found', async () => {
      const mockWhich = jest.fn().mockResolvedValue(null);

      await expect(resolveCLIPath('dbt-unknown'))
        .rejects.toThrow('dbt-unknown not found in PATH');
    });
  });
});
```

**Pattern**:
- Test path resolution with home directory expansion
- Mock OS-level commands
- Test error cases

### 3.3 Shared Code Testing

#### 3.3.1 Pure Utility Functions

**File**: `tests/unit/shared/utils/validators.test.ts`

```typescript
describe('Validators', () => {
  describe('isValidDbtProjectPath', () => {
    it('should return true for valid dbt project', () => {
      // Using test fixture path
      const isValid = isValidDbtProjectPath(
        '/fixtures/valid-dbt-project'
      );
      expect(isValid).toBe(true);
    });

    it('should return false for missing dbt_project.yml', () => {
      const isValid = isValidDbtProjectPath('/tmp/empty-dir');
      expect(isValid).toBe(false);
    });
  });

  describe('isValidDatabaseURL', () => {
    const validURLs = [
      'postgresql://user:pass@localhost:5432/mydb',
      'mysql://root@127.0.0.1:3306/test',
      'sqlite:///path/to/database.db',
    ];

    it.each(validURLs)('should accept %s', (url) => {
      expect(isValidDatabaseURL(url)).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(isValidDatabaseURL('not-a-url')).toBe(false);
      expect(isValidDatabaseURL('')).toBe(false);
    });
  });
});
```

**Pattern**:
- Pure functions, no mocks needed
- Parametrized tests for comprehensive coverage
- Test boundary conditions
- Test with real fixtures when available

---

## Part 4: Implementation Plan & Timeline

### 4.1 Phase 1: Foundation (Weeks 1-2)

**Goals**: Set up unit test infrastructure, establish patterns

**Status**: Implemented ✅

**Implementation Notes (Repo)**:

- Unit Jest config: `tests/unit/jest.config.js`
- Unit setup/mocks:
  - `tests/unit/__setup__/jest.setup.ts`
  - `tests/unit/__setup__/electron.mock.ts`
  - `tests/unit/__setup__/ipcRenderer.mock.ts`
- Shared mocks: `tests/mocks/*`
- Scripts (see `package.json`):
  - `npm test`
  - `npm run test:watch`
  - `npm run test:coverage`
  - `npm run test:integration`
  - `npm run test:all`
- CI: `.github/workflows/test.yml` runs `npm test`

**Tasks**:

1. **Create Jest Configuration for Unit Tests**
   - Create `tests/unit/jest.config.js`
   - Configure jsdom environment
   - Set up path aliases
   - Define coverage thresholds

2. **Create Global Mocks**
   - `tests/unit/__setup__/electron.mock.ts`
   - `tests/unit/__setup__/ipcRenderer.mock.ts`
   - `tests/unit/__setup__/jest.setup.ts`

3. **Create Mock Implementations**
   - Database adapter mock
   - Cloud storage mocks (S3, Azure, GCS)
   - AI provider mocks
   - Electron API mocks

4. **Update Package Scripts**
   ```json
   {
     "test": "jest --config tests/unit/jest.config.js",
     "test:watch": "jest --config tests/unit/jest.config.js --watch",
     "test:coverage": "jest --config tests/unit/jest.config.js --coverage",
     "test:integration": "jest --config jest.integration.config.js --runInBand",
     "test:all": "npm run test && npm run test:integration"
   }
   ```

5. **Documentation**
   - Create `tests/unit/__setup__/README.md`
   - Create `tests/mocks/README.md`
   - Document mocking patterns and conventions

### 4.2 Phase 2: Core Services (Weeks 3-4)

**Goals**: Build foundation of testable service layer

**Priority Services** (by business impact & testability):

1. **Shared Utils** (Easiest, highest ROI)
   - `src/types/validators.ts`
   - `src/main/utils/*.ts`
   - `src/renderer/helpers/*.ts`
   - **Target**: 100% coverage

2. **Schema Validation** (Zod schemas)
   - `src/main/schemas/*.ts`
   - **Target**: 95% coverage

3. **Core Services**
   - `ConnectionService` (connection management)
   - `ProjectService` (project operations)
   - `SettingsService` (app configuration)
   - **Target**: 85% coverage each

### 4.3 Phase 3: Renderer Layer (Weeks 5-6)

**Goals**: Test React components and hooks

**Priority**:

1. **Service Wrappers** (IPC invocation layer)
   - `connectionService`
   - `projectService`
   - `aiService`

2. **Controller Hooks** (React hooks wrapping services)
   - `useConnectionList`
   - `useCreateProject`
   - `useQueryExecutor`

3. **Reusable Components**
   - Forms (ConnectionForm, QueryForm)
   - Panels (QueryResults, ProjectTree)
   - Dialogs (ConfirmDialog, ErrorDialog)

### 4.4 Phase 4: IPC & Integration (Weeks 7-8)

**Goals**: Test IPC contracts and main process

**Priority**:

1. **IPC Handler Tests**
   - Verify channel registration
   - Test error handling
   - Validate payloads

2. **Main Process Services** (with external dependencies mocked)
   - Database operations
   - File system operations
   - Cloud storage operations
   - AI integration

3. **Coverage Goals**
   - Overall: 75%+
   - Services: 85%+
   - Utils: 95%+

### 4.5 Phase 5: Documentation & CI Integration (Week 9)

**Goals**: Ensure sustainability and automation

**Tasks**:

1. **Create Testing Documentation**
   - `docs/TESTING.md` - Comprehensive testing guide
   - `docs/UNIT-TESTING.md` - Unit testing patterns
   - `docs/MOCKING.md` - Mocking strategies

2. **Update Contributing Guide**
   - Add unit testing requirements for PRs
   - Document test coverage expectations
   - Add test examples to CONTRIBUTING.md

3. **CI/CD Integration**
   - Add unit test step to GitHub Actions
   - Add coverage reporting
   - Fail CI if coverage drops below threshold

4. **Test Infrastructure Enhancements**
   - Add test utilities for common scenarios
   - Create test data factories
   - Document test fixtures

---

## Part 5: Testing Patterns & Guidelines

### 5.1 Universal Patterns

#### Pattern: Pure Function Testing

```typescript
// Good: No dependencies, no setup needed
describe('calculateQueryCost', () => {
  it('should calculate cost based on bytes scanned', () => {
    expect(calculateQueryCost(1_000_000)).toBe(0.005); // $5 per TB
    expect(calculateQueryCost(1_000_000_000_000)).toBe(5); // 1TB = $5
  });
});
```

#### Pattern: Service Method Testing

```typescript
// Good: Isolated service with mocked dependencies
describe('ConnectionService.create', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should validate and create connection', async () => {
    // Arrange
    const input = { name: 'prod-db', type: 'postgres', ... };
    jest.spyOn(Database, 'insert').mockResolvedValue({ id: '123' });

    // Act
    const result = await ConnectionService.create(input);

    // Assert
    expect(Database.insert).toHaveBeenCalledWith(expect.objectContaining(input));
    expect(result.id).toBe('123');
  });
});
```

#### Pattern: React Component Testing

```typescript
// Good: User-centric testing
describe('QueryEditor', () => {
  it('should allow users to write and run queries', async () => {
    const { getByPlaceholderText, getByRole } = render(<QueryEditor />);
    
    await userEvent.type(getByPlaceholderText('SQL Query'), 'SELECT * FROM users');
    await userEvent.click(getByRole('button', { name: /Run/i }));

    await waitFor(() => {
      expect(getByText(/1000 rows/i)).toBeInTheDocument();
    });
  });
});
```

### 5.2 Anti-Patterns (What NOT to Do)

❌ **Testing implementation details**
```typescript
// Bad: Couples test to internal state
expect(component.state.queryId).toBe('123');
```

✅ **Test user-facing behavior**
```typescript
// Good: Tests what user sees
expect(screen.getByText('Query executed')).toBeInTheDocument();
```

---

❌ **Over-mocking**
```typescript
// Bad: Mocks everything, tests nothing real
jest.mock('../utils/helpers');
jest.mock('../constants');
jest.mock('../validators');
// Now test doesn't verify anything real
```

✅ **Mock only external dependencies**
```typescript
// Good: Only mock the boundary
jest.mock('database-adapter');
jest.mock('http-client');
// Tests real business logic
```

---

❌ **Testing Electron internals**
```typescript
// Bad: Tests Electron, not your code
expect(ipcMain.handle).toHaveBeenCalled();
expect(BrowserWindow.show).toHaveBeenCalled();
```

✅ **Test your code that uses Electron**
```typescript
// Good: Tests your logic, mocks Electron
jest.mock('electron');
const result = await myService.executeQuery();
expect(result).toBeDefined();
```

### 5.3 Test Data Management

#### Strategy: Fixtures for Complex Data

**File**: `tests/fixtures/connections/postgres.fixture.ts`

```typescript
export const postgresConnection = {
  id: '123',
  name: 'prod-postgres',
  type: 'postgres',
  host: 'db.example.com',
  port: 5432,
  database: 'production',
  username: 'app_user',
  // password not included in fixture
};

export const mysqlConnection = {
  id: '456',
  name: 'dev-mysql',
  type: 'mysql',
  host: 'localhost',
  port: 3306,
  database: 'test_db',
};
```

#### Strategy: Factory Functions for Dynamic Data

**File**: `tests/fixtures/factories.ts`

```typescript
export function createConnection(overrides = {}) {
  return {
    id: uuid(),
    name: 'test-connection',
    type: 'postgres',
    host: 'localhost',
    port: 5432,
    ...overrides,
  };
}

export function createProject(overrides = {}) {
  return {
    id: uuid(),
    name: 'my-project',
    path: '/home/user/projects/my-project',
    ...overrides,
  };
}
```

**Usage**:
```typescript
it('should handle multiple connections', async () => {
  const conn1 = createConnection({ name: 'db1' });
  const conn2 = createConnection({ name: 'db2' });

  const result = await ConnectionService.listConnections();

  expect(result).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'db1' }),
    expect.objectContaining({ name: 'db2' }),
  ]));
});
```

### 5.4 Test Naming Convention

Follow this format for clarity:

```
describe('[Module/Component Name]', () => {
  describe('[Method/Hook Name]', () => {
    it('should [action] when [condition]', () => {
      // test
    });

    it('should [action] and [secondary action] when [condition]', () => {
      // test
    });

    it('should [error action] when [error condition]', () => {
      // test
    });
  });
});
```

Examples:
```
✓ should create connection when valid config provided
✓ should store encrypted password when credentials included
✗ should throw validation error when name is empty
✓ should retry failed queries up to 3 times
✓ should cancel query and cleanup resources when cancel requested
```

---

## Part 6: Integration with Development Workflow

### 6.1 Before Opening a PR

Developers should run:
```bash
# Run all unit tests with coverage
npm run test:coverage

# Check coverage report
open coverage/index.html

# Run integration tests
npm run test:integration

# Full validation
npm run test:all
```

### 6.2 CI/CD Pipeline Integration

**GitHub Actions Workflow** (`.github/workflows/test.yml`):

```yaml
name: Tests

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test -- --coverage
      - uses: codecov/codecov-action@v3

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
      mysql:
        image: mysql:8
        env:
          MYSQL_ROOT_PASSWORD: test
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:integration
```

### 6.3 Coverage Goals & Thresholds

**By Module Type**:

| Module Type | Target Coverage | Rationale |
|---|---|---|
| Pure Utils | 95%+ | Simple, deterministic, high value |
| Services | 85%+ | Core business logic |
| Schemas | 90%+ | Validation is critical |
| Controllers | 80%+ | React testing complexity |
| Components | 75%+ | UI testing is harder, lower priority |
| IPC Handlers | 90%+ | Contract validation critical |

**Project Overall**: 75%+ coverage required to merge PRs

### 6.4 Test Review Checklist for PRs

When reviewing code with tests, verify:

- [ ] Tests are in `tests/unit/` or `tests/integration/` (appropriately scoped)
- [ ] Tests follow naming convention: `should [action] when [condition]`
- [ ] Tests have clear Arrange-Act-Assert structure
- [ ] Mocks are used only for external dependencies
- [ ] No hardcoded timeouts in tests (use `waitFor` or assertions)
- [ ] No `xdescribe` or `xit` left in committed code
- [ ] Coverage targets met for changed files
- [ ] Tests document expected behavior

---

## Part 7: Risk Mitigation & Success Factors

### 7.1 Common Pitfalls & Solutions

**Pitfall**: Flaky tests due to async operations

**Solution**: Use `waitFor` for async assertions
```typescript
// Bad: Race condition
setTimeout(() => {
  expect(screen.getByText('Loaded')).toBeInTheDocument();
}, 100);

// Good: Deterministic
await waitFor(() => {
  expect(screen.getByText('Loaded')).toBeInTheDocument();
});
```

---

**Pitfall**: Over-mocking makes tests meaningless

**Solution**: Test real logic, mock only boundaries
```typescript
// Bad: Test doesn't verify real behavior
jest.mock('./service');
jest.mock('./utils');

// Good: Test service with mocked adapters
jest.mock('./database-adapter');
jest.mock('./cloud-storage');
const result = await service.handleQuery(); // Real logic
```

---

**Pitfall**: Tests take 30+ minutes to run

**Solution**: Run tests in parallel, except integration tests
```bash
npm run test                    # Runs in parallel (fast)
npm run test:integration       # Runs with --runInBand (serial)
```

### 7.2 Team Success Factors

1. **Documentation**: Clear testing patterns + examples
2. **Tools**: Proper mocking setup + factories ready to use
3. **Culture**: Require tests in PRs, celebrate test coverage
4. **Training**: Pair programming sessions on testing patterns
5. **Monitoring**: Track coverage trends, alert on drops

---

## Part 8: Example Implementation Walkthrough

### 8.1 New Feature: "Export Query Results"

This example shows how to apply all testing patterns to a new feature.

#### Step 1: Define Types & Schema

**File**: `src/types/query.ts`
```typescript
export interface ExportOptions {
  format: 'csv' | 'json' | 'parquet';
  filename?: string;
  includeHeaders?: boolean;
}

export interface ExportResult {
  path: string;
  format: string;
  rowCount: number;
  fileSize: number;
}
```

#### Step 2: Create Zod Schema

**File**: `src/main/schemas/export.schema.ts`
```typescript
import { z } from 'zod';

export const ExportOptionsSchema = z.object({
  format: z.enum(['csv', 'json', 'parquet']),
  filename: z.string().optional(),
  includeHeaders: z.boolean().default(true),
});
```

**Unit Test**: `tests/unit/main/schemas/export.schema.test.ts`
```typescript
describe('ExportOptionsSchema', () => {
  it('should validate correct export options', () => {
    const result = ExportOptionsSchema.safeParse({
      format: 'csv',
      filename: 'results.csv',
      includeHeaders: true,
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid format', () => {
    const result = ExportOptionsSchema.safeParse({
      format: 'xml',
    });
    expect(result.success).toBe(false);
  });
});
```

#### Step 3: Implement Service

**File**: `src/main/services/exportService.ts`
```typescript
export class ExportService {
  static async exportQueryResults(
    queryId: string,
    options: ExportOptions
  ): Promise<ExportResult> {
    // 1. Validate options
    const validated = ExportOptionsSchema.parse(options);

    // 2. Get query results
    const results = await QueryService.getResults(queryId);

    // 3. Format results
    const formatted = this.formatResults(results, validated);

    // 4. Write to file
    const filePath = await FileSystem.write(
      validated.filename || `query-${queryId}.${validated.format}`,
      formatted
    );

    // 5. Return metadata
    return {
      path: filePath,
      format: validated.format,
      rowCount: results.length,
      fileSize: Buffer.byteLength(formatted),
    };
  }

  private static formatResults(results: QueryResult[], options: ExportOptions): string {
    switch (options.format) {
      case 'csv':
        return this.toCsv(results, options.includeHeaders);
      case 'json':
        return JSON.stringify(results);
      case 'parquet':
        return this.toParquet(results);
    }
  }

  // ... formatters ...
}
```

**Unit Test**: `tests/unit/main/services/exportService.test.ts`
```typescript
describe('ExportService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('exportQueryResults', () => {
    it('should export query results as CSV', async () => {
      // Arrange
      const mockResults = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ];
      jest.spyOn(QueryService, 'getResults')
        .mockResolvedValue(mockResults);

      jest.spyOn(FileSystem, 'write')
        .mockResolvedValue('/tmp/results.csv');

      // Act
      const result = await ExportService.exportQueryResults('q123', {
        format: 'csv',
        filename: 'results.csv',
      });

      // Assert
      expect(result.path).toBe('/tmp/results.csv');
      expect(result.rowCount).toBe(2);
      expect(result.format).toBe('csv');
    });

    it('should validate export options', async () => {
      await expect(
        ExportService.exportQueryResults('q123', { format: 'xml' })
      ).rejects.toThrow();
    });

    it('should handle query not found', async () => {
      jest.spyOn(QueryService, 'getResults')
        .mockRejectedValue(new Error('Query not found'));

      await expect(
        ExportService.exportQueryResults('nonexistent', { format: 'csv' })
      ).rejects.toThrow('Query not found');
    });
  });

  describe('formatResults', () => {
    it('should format results as CSV with headers', () => {
      const results = [
        { id: 1, name: 'Alice' },
      ];

      const csv = ExportService['formatResults'](results, {
        format: 'csv',
        includeHeaders: true,
      });

      expect(csv).toContain('id,name');
      expect(csv).toContain('1,Alice');
    });
  });
});
```

#### Step 4: Create IPC Handler

**File**: `src/main/ipcHandlers/export.ipcHandlers.ts`
```typescript
export function registerExportHandlers() {
  ipcMain.handle(
    'export:queryResults',
    async (_event, queryId: string, options: ExportOptions) => {
      return ExportService.exportQueryResults(queryId, options);
    }
  );
}
```

**Unit Test**: `tests/unit/main/ipcHandlers/export.ipcHandlers.test.ts`
```typescript
describe('Export IPC Handlers', () => {
  it('should register export:queryResults handler', () => {
    registerExportHandlers();

    expect(ipcMain.handle).toHaveBeenCalledWith(
      'export:queryResults',
      expect.any(Function)
    );
  });

  it('should call ExportService with correct params', async () => {
    const mockExport = jest.spyOn(ExportService, 'exportQueryResults')
      .mockResolvedValue({
        path: '/tmp/results.csv',
        format: 'csv',
        rowCount: 100,
        fileSize: 5000,
      });

    registerExportHandlers();
    const handler = getIpcHandler('export:queryResults');

    const result = await handler(null, 'q123', { format: 'csv' });

    expect(mockExport).toHaveBeenCalledWith('q123', { format: 'csv' });
    expect(result.rowCount).toBe(100);
  });
});
```

#### Step 5: Create Renderer Service

**File**: `src/renderer/services/exportService.ts`
```typescript
export const exportService = {
  async exportQueryResults(
    queryId: string,
    options: ExportOptions
  ): Promise<ExportResult> {
    return window.electron.ipcRenderer.invoke(
      'export:queryResults',
      queryId,
      options
    );
  },
};
```

**Unit Test**: `tests/unit/renderer/services/exportService.test.ts`
```typescript
describe('Renderer Export Service', () => {
  it('should invoke export:queryResults IPC channel', async () => {
    const mockInvoke = jest.fn().mockResolvedValue({
      path: '/tmp/results.csv',
      format: 'csv',
      rowCount: 100,
      fileSize: 5000,
    });
    window.electron.ipcRenderer.invoke = mockInvoke;

    const result = await exportService.exportQueryResults('q123', {
      format: 'csv',
    });

    expect(mockInvoke).toHaveBeenCalledWith(
      'export:queryResults',
      'q123',
      { format: 'csv' }
    );
    expect(result.path).toBe('/tmp/results.csv');
  });
});
```

#### Step 6: Create Controller Hook

**File**: `src/renderer/controllers/exportController.ts`
```typescript
export function useExportQueryResults() {
  return useMutation(
    async ({ queryId, options }: ExportParams) =>
      exportService.exportQueryResults(queryId, options),
    {
      onSuccess: (result) => {
        toast.success(`Exported to ${result.path}`);
      },
      onError: (error) => {
        toast.error(`Export failed: ${error.message}`);
      },
    }
  );
}
```

**Unit Test**: `tests/unit/renderer/controllers/exportController.test.ts`
```typescript
describe('useExportQueryResults Hook', () => {
  it('should export query results', async () => {
    const { result } = renderHook(() => useExportQueryResults());

    await act(async () => {
      await result.current.mutateAsync({
        queryId: 'q123',
        options: { format: 'csv' },
      });
    });

    expect(result.current.isSuccess).toBe(true);
    expect(result.current.data.path).toBeDefined();
  });

  it('should show error toast on failure', async () => {
    jest.spyOn(exportService, 'exportQueryResults')
      .mockRejectedValue(new Error('Export failed'));

    const { result } = renderHook(() => useExportQueryResults());

    await act(async () => {
      try {
        await result.current.mutateAsync({
          queryId: 'q123',
          options: { format: 'csv' },
        });
      } catch (e) {
        // Expected
      }
    });

    expect(result.current.isError).toBe(true);
  });
});
```

#### Step 7: Create Component

**File**: `src/renderer/components/ExportButton.tsx`
```typescript
export function ExportButton({ queryId }: Props) {
  const { mutate, isLoading } = useExportQueryResults();

  return (
    <Menu>
      <MenuItem onClick={() => mutate({ queryId, options: { format: 'csv' } })}>
        Export as CSV
      </MenuItem>
      <MenuItem onClick={() => mutate({ queryId, options: { format: 'json' } })}>
        Export as JSON
      </MenuItem>
    </Menu>
  );
}
```

**Unit Test**: `tests/unit/renderer/components/ExportButton.test.tsx`
```typescript
describe('ExportButton', () => {
  it('should render export menu options', () => {
    const { getByText } = render(<ExportButton queryId="q123" />);

    expect(getByText('Export as CSV')).toBeInTheDocument();
    expect(getByText('Export as JSON')).toBeInTheDocument();
  });

  it('should export as CSV when clicked', async () => {
    const mockMutate = jest.fn();
    jest.spyOn(exportController, 'useExportQueryResults')
      .mockReturnValue({ mutate: mockMutate, isLoading: false });

    const { getByText } = render(<ExportButton queryId="q123" />);

    await userEvent.click(getByText('Export as CSV'));

    expect(mockMutate).toHaveBeenCalledWith({
      queryId: 'q123',
      options: { format: 'csv' },
    });
  });
});
```

---

## Part 9: Maintenance & Evolution

### 9.1 Keeping Tests Healthy

**Monthly Review**:
- [ ] Check test failure rate (should be <5%)
- [ ] Review coverage trends (should be stable or increasing)
- [ ] Update deprecated dependencies in test setup
- [ ] Remove obsolete mocks/fixtures

**Quarterly**:
- [ ] Review and consolidate duplicate test utilities
- [ ] Update testing documentation
- [ ] Conduct team training on testing patterns
- [ ] Benchmark test execution time

### 9.2 Adding Tests for Bug Fixes

When fixing a bug:

1. Create regression test that reproduces the bug
2. Verify test fails with old code
3. Fix the bug
4. Verify test passes with new code
5. Keep the test (permanent regression prevention)

Example:
```typescript
describe('ConnectionService', () => {
  // Regression test for Issue #456
  it('should not leak credentials in error messages (Issue #456)', async () => {
    const invalidConfig = {
      name: 'bad-db',
      password: 'secret123', // password is PII
    };

    try {
      await ConnectionService.create(invalidConfig);
    } catch (error) {
      // Password should never appear in error message
      expect(error.message).not.toContain('secret123');
      expect(error.message).not.toContain('password');
    }
  });
});
```

---

## Part 10: Appendix - Quick Reference

### Command Reference

```bash
# Run all unit tests
npm run test

# Watch mode (re-run on file change)
npm run test -- --watch

# Run specific test file
npm run test -- connection.service.test.ts

# Run tests matching pattern
npm run test -- --testNamePattern="should export"

# Generate coverage report
npm run test:coverage

# Open coverage report in browser
open coverage/lcov-report/index.html

# Integration tests
npm run test:integration

# All tests (unit + integration)
npm run test:all
```

### File Template: Service Unit Test

```typescript
import { YourService } from '@main/services/your.service';
import * as Dependencies from '@main/adapters/dependency';

jest.mock('@main/adapters/dependency');

describe('YourService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('methodName', () => {
    it('should [expected behavior] when [condition]', async () => {
      // Arrange
      const input = {};
      jest.spyOn(Dependencies, 'someMethod').mockResolvedValue({});

      // Act
      const result = await YourService.methodName(input);

      // Assert
      expect(Dependencies.someMethod).toHaveBeenCalledWith(expect.anything());
      expect(result).toEqual(expect.anything());
    });

    it('should [error behavior] when [error condition]', async () => {
      // Arrange
      jest.spyOn(Dependencies, 'someMethod')
        .mockRejectedValue(new Error('Something failed'));

      // Act & Assert
      await expect(YourService.methodName({}))
        .rejects.toThrow('Something failed');
    });
  });
});
```

### File Template: React Component Unit Test

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { YourComponent } from '@renderer/components/YourComponent';

describe('YourComponent', () => {
  it('should render with expected content', () => {
    render(<YourComponent />);

    expect(screen.getByText('Expected Text')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Click Me/i })).toBeInTheDocument();
  });

  it('should handle user interaction', async () => {
    const onSubmit = jest.fn();
    render(<YourComponent onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: /Submit/i }));

    expect(onSubmit).toHaveBeenCalled();
  });

  it('should display loading state', async () => {
    render(<YourComponent isLoading={true} />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('should display error message', () => {
    render(<YourComponent error="Something went wrong" />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});
```

### Coverage Thresholds Configuration

In `tests/unit/jest.config.js`:

```javascript
coverageThreshold: {
  global: {
    branches: 75,
    functions: 75,
    lines: 75,
    statements: 75,
  },
  './src/main/services/': {
    branches: 85,
    functions: 90,
    lines: 85,
    statements: 85,
  },
  './src/renderer/components/': {
    branches: 70,
    functions: 70,
    lines: 70,
    statements: 70,
  },
}
```

---

## Summary

This unit testing plan provides DBT Studio with a structured, sustainable approach to testing. By following the 7-step Electron architecture, organizing tests by layer, and establishing clear patterns, DBT Studio will achieve:

✅ **75%+ test coverage** within 9 weeks  
✅ **Reliable, fast unit tests** (<5 seconds total execution)  
✅ **Scalable test infrastructure** for team growth  
✅ **Clear documentation** for new contributors  
✅ **Confidence in refactoring** and new features

The implementation prioritizes high-value, easy-to-test code first (pure functions and services), progressively building toward UI component testing. This phased approach minimizes disruption while building testing culture incrementally.

---

## Related Test Plans

DBT Studio implements a comprehensive three-layer testing strategy:

### 📚 Testing Documentation

1. **[16-unit-tests-for-dbt-studio.md](./16-unit-tests-for-dbt-studio.md)** (THIS DOCUMENT)
   - **Scope**: Pure logic, mocked dependencies
   - **Tools**: Jest + ts-jest + jsdom
   - **Speed**: <5 seconds total
   - **Coverage**: 80% goal
   - **Examples**: Utilities, services, components, controllers

2. **[15-integrations-tests-for-dbt-studio.md](./15-integrations-tests-for-dbt-studio.md)**
   - **Scope**: IPC contracts, real databases, service interactions
   - **Tools**: Jest + Node environment + testcontainers
   - **Speed**: 5-10 minutes
   - **Coverage**: 80% for backend services
   - **Examples**: PostgreSQL connections, DuckDB queries, IPC handlers

3. **[docs/ai-context/plans/014-plan-dbt-studio-e2e-playwight-testing.md](./docs/ai-context/plans/014-plan-dbt-studio-e2e-playwight-testing.md)**
   - **Scope**: Complete user workflows through UI
   - **Tools**: Playwright + Electron
   - **Speed**: 20-30 minutes
   - **Coverage**: Critical user paths
   - **Examples**: Create project, run query, export results, manage connections

### 🔄 Test Collaboration

**Unit → Integration → E2E**

```
Unit Test (Fast)
├── Tests: ConnectionService.create() with mocked DB
├── Verifies: Business logic correct
└── Mocks: Database, encryption, file system

Integration Test (Medium)
├── Tests: IPC 'connection:create' → Service → Real DB validation
├── Verifies: Service works with real dependencies
└── Real: PostgreSQL testcontainer

E2E Test (Slow)
├── Tests: User fills form → IPC → Backend → DB → Results displayed
├── Verifies: Complete workflow works
└── Real: Full Electron app running
```

### ✅ Recommended Testing Workflow

**When adding a feature:**

1. **Start with unit test** - Design/implement service logic in isolation
2. **Add integration test** - Verify service works with real database
3. **Add E2E test** - Verify user can interact with feature
4. **Run all tests** - `npm run test && npm run test:integration && npm run e2e`

**When fixing a bug:**

1. **Write regression unit test** - Verify bug is reproduced
2. **Fix the bug** - Update service/component logic
3. **Add integration/E2E test** - If bug involves multiple layers
4. **Keep regression test** - Permanent prevention of re-occurrence

