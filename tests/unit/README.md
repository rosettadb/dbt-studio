# Unit Tests
 
 ## How unit testing is set up
 
 - **Runner**: Jest
 - **TypeScript**: `ts-jest`
 - **Test environment**: `jsdom`
 - **Jest config**: `tests/unit/jest.config.js`
 
 The config:
 
 - Sets `rootDir` to the repo root (`../..`) so `<rootDir>/...` paths are stable.
 - Runs global setup via `tests/unit/__setup__/jest.setup.ts`.
 - Mocks the `electron` module using `tests/unit/__setup__/electron.mock.ts`.
 - Installs a `window.electron.ipcRenderer` mock (matching the preload API) via `tests/unit/__setup__/ipcRenderer.mock.ts`.
 - Ignores `release/app` to avoid `jest-haste-map` collisions due to a second `package.json`.
 
 ## Folder structure
 
 - `tests/unit/__setup__/`
   - `jest.setup.ts`
   - `electron.mock.ts`
   - `ipcRenderer.mock.ts`
 - `tests/unit/**` contains unit tests (`*.test.ts` / `*.test.tsx`).
 - `tests/mocks/` contains reusable mock implementations.
 
 ## How to run
 
 - **Run unit tests**
   - `npm test`
 - **Watch mode**
   - `npm run test:watch`
 - **Coverage**
   - `npm run test:coverage`

## Run section-by-section (debugging)

- **Clear Jest cache** (useful if Jest appears to run stale code)
  - `npx jest --clearCache`
- **Run a single test file**
  - `npx jest --config tests/unit/jest.config.js tests/unit/renderer/helpers/utils.test.ts --runInBand`
- **Run tests by name** (matches `describe` / `it` strings)
  - `npx jest --config tests/unit/jest.config.js tests/unit/renderer/helpers/utils.test.ts -t "generateFilename" --runInBand`
  - `npx jest --config tests/unit/jest.config.js tests/unit/renderer/helpers/utils.test.ts -t "compileCommand" --runInBand`

## Related scripts

- `test`: runs unit tests (`tests/unit/jest.config.js`)
- `test:integration`: runs integration tests (`jest.integration.config.js`)
- `test:all`: runs both

## Phase 2 additions (schemas + helpers)

Added unit tests:

- `tests/unit/renderer/helpers/utils.test.ts`
- `tests/unit/renderer/schemas/providerSchema.test.ts`
- `tests/unit/renderer/schemas/dataLakeSchemas.test.ts`
- `tests/unit/renderer/schemas/instanceEditSchema.test.ts`

To make schema unit testing possible without rendering UI components, some Zod schemas are exported:

- `src/renderer/components/ai/CreateProviderDialog.tsx` (`providerSchema`)
- `src/renderer/components/dataLake/DataLakeConnectionWizard.tsx`
  - `instanceBasicsSchema`
  - `storageConfigSchema`
  - `catalogConfigSchema`
  - `runtimeOptionsSchema`
- `src/renderer/components/dataLake/DataLakeInstanceEditForm.tsx` (`instanceEditSchema`)
