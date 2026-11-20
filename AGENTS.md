# AGENTS.md

Guide for AI coding agents (and people) working in this repository. Read it
before changing code. For how to contribute, see
[CONTRIBUTING.md](./CONTRIBUTING.md); for the rules on AI-assisted
contributions, see [AI_POLICY.md](./AI_POLICY.md).

## What This Is

Rosetta dbt Studio is an Electron desktop app for building and running dbt
projects: projects and Git, database connections, a SQL editor and notebooks,
cloud object storage, DuckLake and Iceberg data lakes, pipelines, analytics
pages, and screen-scoped AI agents.

The `dev` branch is the source of truth. Pull requests target `dev`.

## Stack

| Layer | What the app uses |
| --- | --- |
| Shell | Electron (electron-react-boilerplate, webpack), TypeScript |
| Renderer | React 18, MUI 6, **React Query v3** (`react-query`, not `@tanstack/*`), React Hook Form + Zod, Monaco |
| Main | Node services; `better-sqlite3` + Drizzle; `@duckdb/node-api`; `keytar`; `simple-git`; Python bridges in `resources/python/` |
| AI | Vercel AI SDK v6 (`ai`, `@ai-sdk/*`, `@ai-sdk/mcp`) |
| Tests | Jest (`tests/unit`, `tests/integration`), Playwright (`e2e/`) |

Your training data may predate some of these (AI SDK v6, DuckLake, the DuckDB
Node API, React Query v3 vs v5). Check the installed package's types or an
existing call site before writing API calls from memory.

App dependencies (native modules and anything the main process loads at run
time) go in `release/app/package.json`. Build and dev tooling goes in the root
`package.json`.

## Layout

```text
src/
├── main/                 Electron main process
│   ├── main.ts           app start
│   ├── preload.ts        the only bridge to the renderer (typed by Channels)
│   ├── ipcSetup.ts       registers every handler group
│   ├── ipcHandlers/      <feature>.ipcHandlers.ts, one-line handlers
│   └── services/         <feature>.service.ts, all main-process logic
│       └── ai/           agents, tools, providers, MCP, skills
├── renderer/             React app
│   ├── screens/          routed screens
│   ├── components/       UI by feature
│   ├── controllers/      React Query hooks (<feature>.controller.ts)
│   └── services/         renderer services that call IPC
├── connections/          one folder per database, plus core/ and registries
├── shared/               code used by both processes
└── types/                shared types; ipc.ts holds the channel types
tests/unit/               Jest unit tests, mirroring src/
tests/integration/        Jest integration tests (PostgreSQL in CI)
e2e/                      Playwright end-to-end tests
```

## The One Pattern

Every renderer↔main feature is a vertical slice through the same layers:

```text
screen/component → controller hook (React Query) → renderer service
  → ipcRenderer.invoke('<feature>:<action>') → preload (typed by Channels)
  → ipcMain handler (one line) → main service (all logic)
  → SQLite / DuckDB / keytar / child process
```

Before adding code, open the closest existing feature (for example saved
queries: `savedQueries.ipcHandlers.ts`, `savedQueries.service.ts`, and their
renderer controller and service) and copy its shape. Find a feature's files
with `git grep -n "'<feature>:" src/`.

## Rules

Each rule exists because breaking it isn't caught by types or tests.

- **Handlers stay one line.** A global wrapper serializes handler errors for
  the renderer, so handlers have no `try/catch`, logging, or logic. Put it in
  the service.
- **Secrets live only in keytar** (`secureStorage.service.ts`). Never in
  `database.json`, SQLite, `profiles.yml`, project files, the renderer, logs,
  tests, or Git.
- **Database-specific behavior lives only in `src/connections/<db>/`.** Never
  branch on a connection type (`if (type === 'postgres')`, `switch (type)`, a
  table keyed by database names) in a screen, service, hook, or agent outside
  that folder. Put the behavior on the database's connector class
  (`Connection` / `ConnectionDbt` in `src/connections/core/`, files
  `*.main.ts`) or its UI entry (`*.ui.tsx`), and read it through
  `registry.main.ts`, `registry.renderer.ts`, or `registry.shared.ts`. Lint
  doesn't enforce this, so check before you finish:

  ```bash
  git grep -nE "(case|===|!==) '(postgres|snowflake|bigquery|redshift|databricks|duckdb|sqlite|kinetica|mysql|oracle|ducklake|spanner)'" src
  ```

  It must find nothing new outside `src/connections`.
- **Never "fix" connectivity** by editing `profiles.yml` or replacing
  env-var references with literal credentials.
- **The renderer never gets raw filesystem access** to private app data
  (Agent Memory, secrets). IPC passes IDs and DTOs.
- **Large data stays out of the renderer.** Paginate in the main process, and
  export with DuckDB `COPY ... TO`.
- **The renderer gets OS and path facts from `src/renderer/lib/path.ts`**,
  never from `navigator` or `window.electron.app.os` (ESLint enforces this).
- **The app's AI agents run only the app's own tools**, registered in the main
  process and behind the confirmation gate. Never give them general shell
  access, and never route them through an external agent runtime or CLI.
- **User-facing copy says "Agent Memory" / "Project Memory"**, never
  "second brain".
- **It looks like an IDE, not a website.** Compact controls, icons on select
  options, and start icons on action buttons. Copy an existing screen's
  toolbar, buttons, and selects rather than inventing new styles.

## Scope

- One pull request covers one issue or feature and changes only the files it
  needs. There's no line limit, but leave out unrelated refactors, renames,
  formatting, and drive-by fixes. Report bugs you notice elsewhere instead of
  fixing them in the same change.
- Shared surfaces (`preload.ts`, `ipcSetup.ts`, `src/types/ipc.ts`, the app
  shell, the theme) get the smallest change the task needs.
- Don't add dependencies unless the issue calls for it.
- Sensitive areas (AI agents and MCP, credentials and auth, release and CI,
  IPC surfaces) need the design agreed in the issue before coding. See
  [CONTRIBUTING.md](./CONTRIBUTING.md#sensitive-areas).
- Before finishing, compare the changed files with the issue's scope.

## Verify

Lint and type-check before reporting a change done, however small:

```bash
npx eslint <changed .ts/.tsx/.js files> --fix
npx tsc --noEmit                 # whole project; single-file tsc ignores tsconfig
npm test -- <path or pattern>    # Jest unit tests for the change
```

- Fix every ESLint and `tsc` error in the changed files, and any error the
  change caused elsewhere.
- Add or update unit tests in `tests/unit/` next to the code you changed.
  Native modules (keytar, database drivers, Electron) are mocked in
  `tests/unit/__setup__/`.
- Run `npm run test:integration` for IPC, service, or persistence changes
  (it needs PostgreSQL; see `.github/workflows/integration-tests.yml`).
- Static checks don't prove the packaged app, live databases, AI providers,
  or cloud services work. Say what you verified and what you didn't.

## Pull Requests

- Title: [Conventional Commit](https://www.conventionalcommits.org/), for
  example `fix(sql-editor): keep cursor position after format`.
- Description: `Closes #<issue>`, what changed, how you tested it, and whether
  AI tools were used (the template asks).
- Commits must be signed.
- Never commit secrets, `.env` files, local databases, logs, or build output.
