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
 
 ## Related scripts
 
 - `test`: runs unit tests (`tests/unit/jest.config.js`)
 - `test:integration`: runs integration tests (`jest.integration.config.js`)
 - `test:all`: runs both
