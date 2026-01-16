# End-to-End Testing (Playwright)

This directory contains End-to-End tests for DBT Studio using [Playwright](https://playwright.dev/).

## Prerequisites

Before running tests, you must ensure that the Main and Renderer processes are built correctly, and importantly, that the Renderer artifacts are copied to the location expected by the test environment.

### 1. Build the Main Process
```bash
npm run prestart
```

### 2. Build the Renderer Process & Copy Artifacts (CRITICAL)
**You must run this command whenever you change renderer code (UI components, screens, etc.)**

```bash
npm run build:renderer && cp -R release/app/dist/renderer/* .erb/renderer/
```

> **Why?** The E2E tests run against the development build of the Main process (`.erb/dll/main.bundle.dev.js`), which expects renderer assets to be available in `.erb/renderer/`. However, `npm run build:renderer` outputs to `release/app/dist/renderer/`. The copy command bridges this gap.

## Running Tests

### Run All Tests
```bash
npm run test:e2e
```

### Run Specific Test File
```bash
npm run test:e2e -- e2e/tests/projects/project-lifecycle.spec.ts
```

### Run Specific Test Case (grep)
```bash
npm run test:e2e -- -g "should create a new project"
```

### Run in Headed Mode (Visual)
```bash
npm run test:e2e -- --headed
```

### Debug Mode
```bash
npm run test:e2e -- --debug
```

## Troubleshooting

-   **"Target page, context or browser has been closed"**: This often happens if the Main process crashes or if the renderer fails to load (e.g., missing files in `.erb/renderer`).
-   **"TimeoutError"**: Check if the application is stuck on a loading screen. Use `--headed` mode to investigate.
-   **Native Module Errors**: Ensure you have run `npm install` and rebuilt native modules if switching environments.
-   **Seeding Data**: Tests run with isolated `userData` directories. If your test depends on existing data (projects, connections), you must programmatically seed it in your test or fixture. See `e2e/fixtures/electron.fixture.ts` and `project-lifecycle.spec.ts` for examples.

## Testing Strategy & Best Practices

DBT Studio's E2E testing framework is built on industry-standard principles for Electron applications:

- **Black Box Methodology**: We interact exclusively with the application's UI via Playwright's Electron API. This ensures we test the same integration paths as the end user, rather than mocking internal logic.
- **Environment Isolation**: Each test runs with a unique, temporary `userData` directory (defined in `electron.fixture.ts`). This prevents "dirty state" leakage between tests and ensures hermetic execution.
- **Serial Execution**: Because Electron instances share system-level resources (like single-instance locks), all E2E tests are configured to run sequentially (1 worker) to maintain stability.
- **Page Object Model (POM)**: We use POMs to separate UI selectors and interaction logic from the actual assertions. This makes the test suite resilient to minor CSS or layout changes.
- **Programmatic Seeding**: Instead of manually clicking through complex setup flows, we use file-system and database seeding (via `electron.fixture.ts` or directly within tests) to reach the required starting state quickly and reliably.
- **CI/CD Optimization**: The suite is designed for headless execution in CI environments. We use virtual display buffers (like Xvfb) and ensure standard Playwright artifacts (reports, screenshots, traces) are captured on failure for debugging.
- **Critical Flow Focus**: We prioritize testing "happy paths" and high-impact workflows (e.g., project creation, connection management, SQL execution) while relying on unit/integration tests for granular edge cases.


## Project Structure

-   `e2e/fixtures/`: Playwright fixtures (Electron app launch, userData setup).
    -   `electron.fixture.ts`: Main fixture handling launching and `autoSkipSetup` logic.
-   `e2e/page-objects/`: Page Object Models for screens.
-   `e2e/tests/`: Test specifications.
    -   `setup/`: Installation and onboarding tests.
    -   `projects/`: Project lifecycle tests.