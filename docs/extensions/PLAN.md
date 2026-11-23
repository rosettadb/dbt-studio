# Extension system: design and work plan

This file is the working record. It says what the system is, what is done and what is not.
Git is not used by the assistant in this repo, so this file is the only record of progress.

**Resuming in a new session:** read sections 1 to 3, then the progress log (section 7), run the gate (section 5) to confirm the tree is green, and continue at the first unchecked task in section 4. Update the checkboxes and add a progress-log line before the session ends.

Legend: `[ ]` not started, `[~]` in progress, `[x]` done and the gate passed.

---

## 1. What is being built

Studio gets a real extension system, the kind other editors have: an Extensions screen where an extension is installed, enabled, disabled and uninstalled; most changes apply immediately, some need a restart. It is Studio's own system. It does not run VS Code or Sublime extensions; limited cross-support (themes, basic Monaco add-ons) comes later.

Studio itself stays as it is. These existing tools are converted to extensions, shipped inside the app as internal extensions, using exactly the API an installed extension gets:

- SQL Editor
- dbt SQL (separate extension, built on top of SQL; if layering is too tangled, two separate file handlers)
- Analytics
- Notebooks
- Pipeline

Not touched: Flowfile (`/app/flows`), which is an external service unrelated to pipelines; everything else in Studio.

### What an extension can do

1. Add a sidebar menu item.
2. Add a screen.
3. Add components into an existing screen.
4. Add formatting / autocomplete to the editor(s).
5. Take over a file type, with custom props beyond the mandatory ones (example: `.sql` opens in the SQL extension's editor with `compact`).
6. Add a button or function to the editor breadcrumb area (preview, run).
7. Hook lifecycle points: pre-save, post-save, open, close.
8. Implement exposed interfaces, such as connections.
9. Add backend handlers and bridges (main process asks the UI for something).

### Fixed rules for the conversion

Studio has users. Converting a tool changes where its code lives and how it attaches, not what it does.

- Same routes, sidebar order, labels, test ids (`nav-item-sql`, ...).
- Same stored data: localStorage keys, `database.json` keys, `userData` folders.
- Same IPC channel names.
- No clean-up, dedupe or deletion of code along the way. Code that moves, moves as it is.
- The legacy SQL notebook flavour gets no conversion work of its own; it moves with the Notebooks screen unchanged so nobody loses notebooks.
- Analytics stays where users see it today (a tab in the SQL and Notebooks screens).
- One intended addition, from the owner's own example: a plain `.sql` file in a project opens in the SQL extension's compact editor with Run. It runs against the project's connection and shows results in the existing Query Results panel.

---

## 2. Design

### 2.1 Package

An extension is a folder (or a `.zip` of that folder) with a `package.json`:

| Field | Meaning |
|---|---|
| `publisher`, `name` | Lowercase letters, digits, dashes. The id is `publisher.name`. |
| `version` | `1.2.3` |
| `displayName`, `description` | Shown on the Extensions screen |
| `engines.rosettaStudio` | Studio versions supported: `*`, `1.8.0`, `^1.8.0`, `>=1.8.0` |
| `main` | Main-process entry (CommonJS), optional |
| `renderer` | UI entry, optional. At least one of `main` / `renderer` is required |
| `extensionDependencies` | Ids that must be active first |
| `requiresRestart` | `true` when the extension cannot be switched on or off live |

Each entry exports `activate(api)` and optionally `deactivate()`. `activate` may return an object that dependants read with `api.extensions.getExports(id)`.

### 2.2 Where code lives

```
src/extensionApi/     the contract: shared.ts, main.ts, renderer.ts
src/extensionHost/    the host
  shared/             manifest, wire types
  main/               discovery, install, activation, protocol, IPC
  renderer/           registries, loader, activation, React provider
src/extensions/       internal extensions: pipeline/ sql/ dbt/ analytics/ notebooks/
                      each: manifest.shared.ts, renderer/, main/, shared/
```

Suffixes follow `src/connections`: `.main.ts`, `.renderer.ts(x)`, `.shared.ts`.

Installed extensions live in `<userData>/extensions/<id>/`. State (which are disabled) is `<userData>/extensions/state.json`.

### 2.3 Internal and installed extensions use one path

| | Internal | Installed |
|---|---|---|
| Code reaches the host | Compiled into the app, listed in `builtinExtensions.{main,renderer}.ts` | Found on disk, loaded at runtime |
| Manifest check, dependency order, activation, tracking, failure isolation, enable/disable | Same host code | Same host code |
| API | `activate(api)` | `activate(api)` |

Boundary, enforced by lint: files under `src/extensions/<id>/` import only from `src/extensionApi/`, their own folder and npm packages. Nothing outside `src/extensions/` imports from it except the two builtin list files. Whatever an internal extension needs from Studio is exported through `src/extensionApi/`; that export list is what installed extensions receive at runtime. No back doors: if the API cannot carry an internal extension, the API is extended.

### 2.4 Lifecycle

- **Activation order** follows `extensionDependencies`. An extension whose dependency is missing, disabled or failed is not activated and shows the reason.
- **Tracking:** every registration made through `api` returns a disposer and is recorded for that extension. Deactivation disposes all of them in reverse order, then calls `deactivate()`.
- **Failure isolation:** an error in one extension's manifest, load or `activate` marks that extension failed with the message. Studio and other extensions keep running.
- **Live vs restart:**
  - Install, enable, disable: applied live (both halves), unless the manifest says `requiresRestart`.
  - Uninstall or update of an extension whose code is already loaded: its contributions are removed live; the Extensions screen shows "Restart to finish", because loaded code cannot be unloaded.
- **Startup:** the UI waits for the first activation pass before rendering routes, so a deep link to an extension screen does not fall through to the catch-all redirect.
- **Shutdown:** `before-quit` awaits deactivation of all main halves before `app.exit(0)`.

### 2.5 Runtime loading

- **Main half:** Node `require` of the entry file.
- **UI half:** a script served from the extension folder over the `rosetta-ext://<id>/...` scheme. The script calls `window.rosettaStudio.define(id, dependencies, factory)`; the host resolves `dependencies` (React, React DOM, MUI, Emotion, React Router, React Query, Monaco, `@rosetta/studio-api`) from its own copies and calls the factory, which returns the module with `activate`. This is the AMD shape, produced by webpack (`library.type: 'amd'` with `amdContainer`) or rollup (`format: 'amd'`). No `eval`.
- CSP in `src/renderer/index.ejs` gains `rosetta-ext:` for scripts.
- **Trust:** an installed extension runs with the app's rights. Install asks for confirmation. There is no marketplace; install takes a folder or `.zip`. A catalogue could later download a package and call the same install.

### 2.6 API surface

Renderer (`api` in the UI half):

| Capability | Call | Replaces / builds on |
|---|---|---|
| Sidebar item | `navigation.addItem` | `components/sidebar/elements.ts` |
| Screen | `screens.add` | static routes in `App.tsx` |
| Components into a screen | `slots.add(slotId, ...)`; screens render `<Slot id>` | `AppLayout` slots |
| Bottom panel | `panels.add` | `terminal/panels/registry.ts` |
| Dashboard card | `dashboard.addCard` | `screens/dashboard/index.tsx` |
| Settings page | `settings.addPage` | `screens/settings/settingsElements.tsx` |
| App-wide provider | `app.addProvider` | provider stack in `App.tsx` |
| File type handler | `fileViews.add({ id, priority, matches, Component, props })` | `components/fileViews/registry.ts` |
| Breadcrumb button | `editor.addAction({ id, when, Component })` | `editorHeader` `extraActions` |
| Editor language features | `monaco` (shared namespace; providers are disposables) | `lib/monaco/bootstrap.ts` |
| Hooks | `files.onWillSave / onDidSave / onDidOpen / onDidClose` | new single save function |
| File tree | `fileTree.addRowActions / addHoverPreview` | `fileTreeViewer/TreeNode.tsx` |
| Commands | `commands.add` | `commandPalette/commands.ts` |
| Backend calls | `ipc.invoke / ipc.on` | `window.electron.ipcRenderer` |
| Bridge answers | `bridge.handle(operation, handler)` | the five hand-written bridges |
| Other extensions | `extensions.getExports(id)` | new |
| Storage | `storage.get / set` (localStorage, namespaced) | new |

Main (`api` in the main half):

| Capability | Call |
|---|---|
| Backend handlers | `ipc.handle(channel, handler)`, `ipc.send(channel, payload)` |
| Ask the UI | `bridge.request(operation, payload)` |
| Hooks | `workspace.onDidSaveFile` (editor saves and AI agent writes) |
| AI | `agents.add(screenKey, factory)`, `agents.addTools(...)` |
| Connections | `connections.register(...)` |
| Files of its own | `storagePath` |
| Other extensions | `extensions.getExports(id)` |

The old registries are replaced by the host's registries, not wrapped: one generic registry (add with disposer, ordered list, subscribe) backs all of them, and their current users are moved onto it.

Injection points are implemented in the phase that first needs them (phase column in section 4), so nothing is built on a guess.

---

## 3. Facts about the current code that the work depends on

- Baseline on 2026-11-23 (version 1.7.8): `npx tsc --noEmit -p tsconfig.json` 0 errors; `npx jest --config tests/unit/jest.config.js` 223 suites / 2209 tests passing; `npm run lint` 0 errors.
- Lint forbids `for...of` and `for...in` (airbnb); use array methods.
- The renderer is one webpack bundle; no code splitting.
- `registerHandlers` in `src/main/ipcSetup.ts` runs for the main window and for the setup window; host start-up must be safe to call twice.
- `protocol.registerSchemesAsPrivileged` may be called only once; the new scheme is added to the existing call in `src/main/main.ts`.
- `src/main/main.ts:335` `before-quit` calls `app.exit(0)` after its own cleanup; other quit hooks are attached ad hoc in `runner.ipcHandlers.ts:49`, `process.ipcHandlers.ts:79`, `pty.ipcHandlers.ts:132`, `pythonNotebooks.ipcHandlers.ts:160`.
- IPC channel names are a TypeScript union in `src/types/ipc.ts`; `src/main/preload.ts` passes any channel through at runtime. Channel unions of converted features stay in `src/types/ipc.ts`.
- Tests import and mock source files by relative path; every file move must fix them in the same step.
- Sidebar active item is a `path.includes` chain (`components/sidebar/index.tsx:52-64`); the command palette reads the same list (`commandPalette/index.tsx:318, 357`).
- Saving has no central function: about ten paths end at IPC `project:updateFile`; AI tools write with `fs.writeFileSync` directly (`filesystem.tools.ts:225, 451`, `dbt.tools.ts:404, 764`, `pipeline.tools.ts:764, 838`).
- AI agent is chosen by `switch (request.screenKey)` in `src/main/services/agent.service.ts:1644`.
- Cloud runs (`CloudRunProvider`, `CloudLogViewer`, `CloudLogsPanel`, `PushToCloudModal`) are used by dbt cloud runs as well as pipelines: they stay in Studio and are offered through the API.
- `PythonRuntimesService` is shared with dbt Charts and stays in Studio.
- Main-process circular imports to break in phase 6: `connectors.service` and `notebooks.service`; `duckLake.service` and `notebooks.service`; `agent.service` and the notebook tools.

---

## 4. Work

### Phase 1: the extension system

- [x] 1.1 Shared: manifest type, validation, engine check, dependency ordering; wire types; disposables.
- [x] 1.2 API contract files: `src/extensionApi/{shared,main,renderer}.ts`.
- [x] 1.3 Main host: state file, discovery, install (folder / zip), uninstall, enable / disable, activation with tracking and failure isolation, `ipc.handle / send`, bridge request, file-saved event, `rosetta-ext` protocol, host IPC channels, start from `ipcSetup.ts`, deactivate on quit in `main.ts`.
- [x] 1.4 Renderer host: generic registry; registries for navigation, screens, slots, dashboard cards, settings pages, app providers; module loader and shared modules; activation with tracking; provider that gates first render; live reaction to enable / disable.
- [x] 1.5 Replace the old registries with host registries and move their users: file views (add priority, props, removal), bottom panels, commands. Existing tests `fileViews.registry.test.ts`, `terminalPanels.registry.test.ts`, `CommandPalette.test.tsx` keep passing.
- [x] 1.6 Shell reads registries: sidebar and command palette (navigation), `App.tsx` (screens, providers, gate), dashboard (cards), settings (pages). Studio's own items register from core files in the same order. Tests `dashboard*.test.tsx`, `ProjectDetailsTabs.test.tsx`, `App.test.tsx` keep passing.
- [x] 1.7 Extensions screen under Settings: list, state and error, enable / disable, install, uninstall, open folder, restart notice.
- [x] 1.8 CSP and scheme registration.
- [x] 1.9 Lint boundary for `src/extensions/**` (`.eslintrc.js`, two overrides; proven with throwaway probe files).
- [x] 1.10 Unit tests in `tests/unit/extensionHost/` (4 suites, 64 tests): manifest, ordering, registry, sidebar active-item cases, main host (activation order, failure isolation, disable/enable, persisted state, restart-pending, quit order, real install/uninstall from a folder, resource path guard, bridge), renderer host (contributions added and removed, failure isolation, exports, bridge, storage), loader.
- [~] 1.11 Example extension under `docs/extensions/examples/hello/` (sidebar item, screen, command, backend call). Written. **Not yet done: installing it in the running app** (Settings → Extensions → Install from folder) and switching it on and off. The assistant did not launch the app.
- [x] 1.12 Guide, first version: `docs/extensions/GUIDE.md`.

### Phase 2: Pipeline extension

Moves to `src/extensions/pipeline/`: `components/pipelineView/*`, `fileViews/PipelineFileView.tsx`, `fileTreeViewer/PipelineThumbnailPreview.tsx`, `modals/createPipelineModal/*`, `modals/pipelineSelectorModal/*`, `modals/runWithEnvModal/*`, `terminal/panels/RunnerLogsPanel.tsx`, `context/RunnerProvider.tsx`, `hooks/useRunnerContext.ts`, `services/pipelineTemplates.service.ts`, `settings/RunnerSettings.tsx`, `chat/pipelineToolResults.ts`; main `ipcHandlers/runner.ipcHandlers.ts`, `ipcHandlers/pipelineTemplates.ipcHandlers.ts`, `services/runner.service.ts`, `runnerEnvironment.ts`, `sparkEnvironment.ts`, `pluginManifest.service.ts`, `utils/pipelineEnvVars.ts`, `services/ai/tools/studio/pipeline.tools.ts`; shared `src/shared/pluginManifest.ts`.

**Phase 2 design, decided 2026-11-23 (read before continuing):**

- API files: `src/extensionApi/renderer.ts` holds only the contract types plus `Slot`. Pieces of Studio that extensions use are exported from small area files in `src/extensionApi/studio/` (one per area, each re-exporting from the specific Studio module, never from a barrel), so an extension file and its tests load only what they need. `studio/index.ts` re-exports all of them and is what installed extensions get as `@rosetta/studio-api`.
- Internal extensions are registered with the hosts from the entries (`src/renderer/App.tsx`, `src/extensionHost/main/ipc.main.ts`), not from the host singletons.
- Order of work inside phase 2: (a) renderer half moves first; `src/shared/pluginManifest.ts` and `RunnerRequirementStatus` stay in Studio until the main half moves and are reached through a transitional API file `extensionApi/studio/pipelineShared.ts`; (b) main half moves, then that transitional file is deleted and the shared code moves into the extension.
- Injection points added for Pipeline:
  - `fileTree.addRowAction` / `fileTree.addHoverPreview`: registries read by `fileTreeViewer/TreeNode.tsx`; each gets `{ path, name, isFolder, projectPath, gitStatus }`.
  - Slots `project.explorer.footer` (below the file tree, props `{ project }`) and `project.overlays` (always mounted on the project screen, props `{ project }`).
  - `projectMenu.addItem`: entries appended to the project run button menu (`ProjectDbtSplitButton`), with `localOnly` / `cloudOnly` / `dividerBefore` and `onSelect({ project, settings })`.
  - Bottom panels get an `order`; Studio's panels use 100 to 900, the runner logs panel takes 800 (between cloud logs 700 and charts server 900) to keep today's tab order.
  - File views: Studio's preview view gets priority 300 and charts 100; the pipeline view registers with 200, which keeps today's precedence.
- Pipeline keeps its own small store (create / cloud run / local run / selector requests). Its footer contribution renders the Create Pipeline button; its overlay contribution renders the modals. The tree row buttons and the menu entries only write to that store.
- Pipeline manifest sets `requiresRestart: true` because it adds an app-wide provider (`RunnerProvider`).
- `CloudLogViewer.tsx` is cloud-run UI used by dbt cloud runs too: it stays in Studio and moves out of `components/pipelineView/` to `components/terminal/panels/`.
- `components/chat/pipelineToolResults.ts` stays in Studio until 2.9 (chat renders tool results for every tool).

- [~] 2.1 API additions this phase needs. Done: `app.addProvider`, `settings.addPage`, `fileTree.addRowAction`, `fileTree.addHoverPreview`, `projectMenu.addItem`, slots `project.explorer.footer` and `project.overlays`, hidden commands + `runCommand`. Not done: `agents.addTools` with write guards (2.9).
- [~] 2.2 Done in place: the pipeline file view (priority 200), runner logs panel (order 800), `RunnerProvider` (app provider) and the Local Runner settings page are registered from `components/pipelineView/contributions.ts`; removed from `fileViews/index.ts`, `terminal/panels/index.ts`, the provider stack and route list in `App.tsx`, `screens/settings/{index,settingsElements}.tsx`. Not done: moving the files to `src/extensions/pipeline/`.
- [x] 2.3 (in place, code still in `components/pipelineView/`) File tree: Run Pipeline buttons and thumbnail leave `TreeNode.tsx:138-154, 307, 373-420`; remove the `onRunPipeline*` props through `fileTreeViewer/index.tsx`, `ArboristTree.tsx`, `TreeNode.tsx`.
- [x] 2.4 (in place) Create Pipeline button (`sidebar/project-sidebar.tsx:384`) and its modals become a slot contribution.
- [x] 2.5 (in place) Run Pipeline entries in `dbtModelButtons/ProjectDbtSplitButton.tsx:350-373, 556-596` become contributed menu items.
- [x] 2.6 (in place) Dashboard card and the "where should the pipeline go" flow (`dashboard/index.tsx:303-318, 893-930`, `selectProject/index.tsx:106-127`, `projectDetails/index.tsx:83-92`, `project-sidebar.tsx:326-330`) become extension-owned; same screens and dialogs for the user.
- [ ] 2.7 Move the main half; same channel names; pull pipeline code out of `projects.service.ts:1245-1366`, `settings.ipcHandlers.ts:188-214, 333-343`, `projects.ipcHandlers.ts:250-270`; runner quit hook becomes `deactivate`.
- [ ] 2.8 Runner set-up at boot (`main.ts:203-206`) keeps its splash order and messages.
- [ ] 2.9 AI tools and guards move (`pipeline.tools.ts`, guard used by `filesystem.tools.ts:204, 435`, `dbt.tools.ts:374, 745`, wiring in `projectAgent.ts`, `agent.service.ts`, `TabsProvider.tsx:25-29, 309-318`).
- [ ] 2.10 Tests moved and fixed: `pipelineDesignerRoundTrip`, `getPipelineRelativeName`, `StepEditDialog`, `pipelineToolResults`, `TreeNode.refresh`, `dashboard.pipelineChoice`, `selectProject.pipelineMode`, `pipelineFlow.integration`, `runnerBundledCopy`, `runnerDevDownload`, `runnerEnvironment`, `runnerRequirements`, `pipeline.tools`, `pipelineWriteGuards`, `pluginManifest`.
- [ ] 2.11 Guide updated.

### Phase 3: SQL extension

- [ ] 3.1 API additions: `editor.addAction`; `monaco`; the single save function with `files.onWillSave / onDidSave / onDidOpen / onDidClose`; main `workspace.onDidSaveFile` fired for editor saves and the six AI write sites; renderer `bridge.handle`; main `agents.add` replacing the `screenKey` switch.
  Save paths to route through the one function: `editor/index.tsx:465-509, 575-594`, `TabsProvider.tsx:172-211`, `useTabManager.ts:799-828`, `PipelineFileView` visual save, `CodeFileView.tsx:327-337`, `chat/MessageRenderer.tsx:367-385`, `chat/ChatWindow.tsx:880-900`.
- [ ] 3.2 Data pieces that Notebooks and Analytics also use stay in Studio and are exported through the API: `screens/sql/SchemaTreeViewerWithSchema.tsx`, `components/schemaTreeViewer/*`, `utils/sql/schemaDragPayload.ts`, `utils/sql/schemaObjectSql.ts`, `hooks/useSchemaForConnection.ts`, `hooks/useSchemaObjectDrop.ts`, `hooks/useMonacoAutocomplete.ts`, `components/queryResult/queryVisualization/*`, `lib/monaco/completions/sqlSchema.ts`, `lib/monaco/insertText.ts`. `sqlEditor/editorComponent/statements.ts` moves to `src/connections/core/` (the connections layer imports it today).
- [ ] 3.3 SQL screen exposes slots for its sidebar tabs and main view; Analytics (still in Studio until phase 5) contributes through them.
- [ ] 3.4 Move `screens/sql/*`, `components/sqlEditor/*`, `components/sqlTabs/*`, `hooks/useSqlTabManager.ts`, `controllers/savedQueries.controller.ts`, `services/savedQueries.service.ts`, `controllers/editor.controller.ts`; register sidebar item, screen, dashboard card, the `data-lake/history` redirect, commands, AI button.
- [ ] 3.5 SQL editor exported as a reusable component with `compact`; `.sql` file handler registered (the one intended addition, section 1).
- [ ] 3.6 Main half: `savedQueries` handlers and service; SQL agent, `sql.tools.ts`, `monaco.tools.ts`; `editorBridge` and `agentEditorBridge` onto the generic bridge. `ConnectorsService` and `connector:*` stay in Studio.
- [ ] 3.7 Tests moved and fixed: `sqlEditorStatements`, `SqlEditor.errors`, `SqlTabManager.copy`, `SchemaTreeContextMenu`, `SchemaTreeViewerWithSchema`, `sqlSchemaCompletions`, `schemaObjectSql`; e2e `e2e/tests/sql-editor/*`.
- [ ] 3.8 Guide updated.

### Phase 4: dbt SQL extension (depends on SQL)

- [ ] 4.1 Read `dbtModelButtons/*`, `hooks/useProjectSqlExecution.ts`, `hooks/useProjectQueryResultsPanel.ts`, `components/projectQueryResults/*`, `context/QueryResultsProvider.tsx`, language intelligence; write the file list here.
- [ ] 4.2 Higher-priority `.sql` handler for projects with the dbt capability, reusing the SQL extension's exported editor and adding `jinja-sql`, compile-before-run, the Execute code lenses (`editor/index.tsx:309-429`), the AI menu and model button (`CodeFileView.tsx:224-315`).
- [ ] 4.3 Move `lib/monaco/jinjaSqlLanguage.ts`, `completions/jinjaSql.ts`, `completions/sqlKeywords.ts`, dbt parts of `completions/python.ts`, language intelligence (renderer and main).
- [ ] 4.4 `CodeFileView.tsx` and `editor/index.tsx` hold no SQL or dbt knowledge.
- [ ] 4.5 Project top-bar dbt button (`projectTypes/index.tsx:26-28, 59-62`) becomes a slot contribution.
- [ ] 4.6 Tests and guide.

### Phase 5: Analytics extension

- [ ] 5.1 Read `components/analytics/*`, `controllers/analyticsPages.controller.ts`, `services/analyticsPages.service.ts`, `services/analyticsEditorBridge.service.ts`, main `analyticsPages.*`, `staticSite.*`, `ai/agents/analyticsAgent.ts`, `src/shared/analyticsBi/*`, `scripts/build-analytics-runtime.mjs` (fixed paths, runs on every build); write the file list here.
- [ ] 5.2 Move; contribute the tab and main view into the SQL and Notebooks screens through their slots; dashboard card; agent; bridge.
- [ ] 5.3 Tests and guide.

### Phase 6: Notebooks extension

- [ ] 6.1 Host events that break the circular imports: connection deleted (today `connectors.service.ts:475`, `duckLake.service.ts:763`).
- [ ] 6.2 Move renderer: `screens/notebooks/index.tsx`, `components/notebook/*`, the four notebook hooks, notebook services, bridges and controllers, `utils/notebookConnectionTransfer.ts`; register sidebar item, screen, dashboard card, commands, AI button, slots for Analytics. `PythonMonoIcon` moves to Studio's icons (settings, status bar, set-up use it).
- [ ] 6.3 Move main: `ipcHandlers/notebooks.ipcHandlers.ts`, `pythonNotebooks.ipcHandlers.ts`, `services/notebooks.service.ts`, `pythonNotebooks.service.ts`, `notebookKernel.service.ts`, `notebookEnv.service.ts`, `ai/agents/notebooksAgent*.ts`, `ai/tools/studio/notebooks.tools.ts`, `pythonNotebook.tools.ts`. Kernel shutdown becomes `deactivate`. `resources/python/notebook_kernel_bridge.py` packaging checked.
- [ ] 6.4 Bridges onto the generic bridge; agent through `agents.add`.
- [ ] 6.5 Studio services that read notebook folders keep working: `backup.service.ts:84-118, 830`, `settings.service.ts:649-666`, `secondBrainRefresh.service.ts`.
- [ ] 6.6 Tests moved and fixed: `pythonNotebooks.service`, `notebookEnv.service`, `oracleNotebooks`, `pythonNotebooks.ipcHandlers`, `DataFrameTableOutput`, `PythonTextCell`, `tests/python/test_notebook_kernel_bridge.py`, e2e `e2e/tests/notebooks/notebooks.spec.ts`.
- [ ] 6.7 Guide updated.

### Phase 7: connections as an interface

- [ ] 7.1 Read the impact: `SupportedConnectionTypes` is a closed union from a const tuple; `registry.main.ts` / `registry.renderer.ts` are typed maps; `ConnectionInput` / `DBTConnection` unions are used across `src/types/backend.ts`, `src/shared/projectTypes.ts` and many files; `connectors.service.ts:35-40` imports adapter internals.
- [ ] 7.2 `connections.register` (descriptor, connector, UI). The 12 existing adapters stay in Studio and register through the same call.
- [ ] 7.3 Proof: one small adapter installed as an extension.
- [ ] 7.4 Guide updated.

### Phase 8: limited cross-support

- [ ] 8.1 VS Code colour theme JSON to a Monaco theme.
- [ ] 8.2 VS Code snippet JSON to completions.

### Phase 9: guide finished

- [ ] 9.1 `docs/extensions/GUIDE.md`: package, each injection point with a real example from an internal extension, main half, building and installing, testing, rules.

---

## 5. Gate (after every step)

1. `npx tsc --noEmit -p tsconfig.json`: 0 errors.
2. `npm run lint`: 0 errors.
3. `npx jest --config tests/unit/jest.config.js`: all pass; suite count only goes up.
4. Where the environment allows: start the app and exercise what the step touched; e2e for the area that moved.

---

## 6. Risks being watched

| Risk | Handling |
|---|---|
| A moved tool loses user state | Keys and folders frozen (section 1) |
| Start-up order changes (splash, runner, kernels) | Steps 2.8 and 6.3 keep the order |
| Deep link hits the catch-all before extensions activate | UI gates first render on activation |
| One broken extension breaks Studio | Failure isolation per extension |
| File moves break tests | Tests fixed in the same step |

---

## 7. Progress log

| Date | Result |
|---|---|
| 2026-11-23 | Code read, baseline recorded, plan written. |
| 2026-11-23 | **2.6 done.** The Home screen, project list and project screen hold no pipeline code. General mechanism: `/app/select-project` takes `{ afterOpen: { command, message }, startNewProject }`, shows the message, opens the project with `{ runCommand }`; `screens/projectDetails` runs it once on mount. New Home slot `STUDIO_SLOTS.homeOverlays`. Pipeline card (order 700) and the project-choice dialog live in `components/pipelineView/PipelineHomeContributions.tsx`; Studio's Home cards now carry explicit `order`. Tests updated to the new state shape: `dashboard.pipelineChoice`, `selectProject.pipelineMode`, `pipelineFlow.integration`; new cases in `ProjectDetailsTabs`. Gate: tsc 0, lint 0, jest 228 suites / 2283 tests. **Next: move pipeline-owned controllers and services out of the shared files, then the move to `src/extensions/pipeline/`.** |
| 2026-11-23 | **Session stopped here, tree green.** Gate: tsc 0, lint 0, jest 228 suites / 2281 tests, renderer production bundle builds. The app was never launched by the assistant. **Next task: 2.6.** Design for 2.6: replace the pipeline-specific navigation state with a general one. `/app/select-project` takes `{ afterOpen?: { command, message }, startNewProject? }`, shows `message` as its banner and opens the project with `{ runCommand: command }`; the project screen runs that command once on mount; `ExplorerTab` / `ProjectSidebar` lose `openCreatePipeline`. The Home card `pipeline` (order 700, with its icon) and the "Where should the pipeline go?" dialog move to the pipeline tool: card via the dashboard-card registry with `onSelect`, dialog via a new Home slot. Tests that pin today's state shapes and must be updated with it: `dashboard.pipelineChoice.test.tsx`, `selectProject.pipelineMode.test.tsx`, `pipelineFlow.integration.test.tsx`, possibly `dashboard.test.tsx`. After 2.6: move the pipeline-owned controllers and services out of `controllers/settings.controller.ts`, `services/settings.services.ts`, `controllers/projects.controller.ts`, `services/projects.service.ts`; then create `src/extensions/pipeline/` and move the renderer files, adding area files under `src/extensionApi/studio/` for what they import (list produced by the import inventory: `Editor`, `UnsavedChangesDialog`, `ConfirmationModal`, `PushToCloudModal`, `Modal`, settings layout parts, `useTerminalMinimize`, `useTabs`, cloud run hooks, `useTaskManager`, `useTaskChannel`, `useRefreshProjectFiles`, `useSecureStorage`, `useIsTaskTypeActive`, `useGetConnectionById`, `useGetSettings`, `useSetConnectionEnvVariable`, cloud action hooks, `projectsServices`, git `getFileStatus` / `isFileUnpushed`, `secureStorageService`, `materializeSnowflakeToken`, `getConnectionUi`, `lib/path`, `projectTypeOf`, types). |
| 2026-11-23 | **2.2 done in place** (see task). Gate: tsc 0, lint 0, jest 228 suites / 2281 tests. |
| 2026-11-23 | **Phase 2 started, steps 2.3 to 2.5 done in place.** The file tree, project sidebar and dbt project button no longer know about pipelines. New in `components/pipelineView/`: `pipelineRunStore.ts`, `PipelineTreeContributions.tsx`, `PipelineExplorerFooter.tsx`, `PipelineOverlays.tsx`, `pipelineMenuItems.tsx`, `contributions.ts` (registers straight into the registries; imported from `App.tsx`; becomes `activate(api)` at the move). `ExplorerTab` still receives `openCreatePipeline` and runs the hidden command `pipeline.create` (goes away in 2.6). Gate: tsc 0, lint 0, jest 228 suites / 2281 tests. New test: `tests/unit/renderer/components/pipelineContributions.test.tsx`. Next: 2.2 in place (provider, settings page, panel order, file view priority), then 2.6, then the controller/service extraction, then the move. |
| 2026-11-23 | **Phase 1 built.** Gate: tsc 0 errors, lint 0 errors, jest 227 suites / 2273 tests passing (223 original + 4 new), both production bundles build. Not run in the live app. See "State after phase 1" below. Next: phase 2, task 2.1. |

### State after phase 1

New code:

- `src/extensionHost/shared/`: `manifest.shared.ts` (manifest, validation, engine check, dependency order), `protocol.shared.ts` (host channels, bridge and file-event types, disposables).
- `src/extensionHost/main/`: `ExtensionHost.main.ts` (the host), `extensionStore.main.ts` (state file, discovery, install / uninstall), `fileEvents.main.ts`, `ipc.main.ts` (host channels, install dialog, `rosetta-ext` protocol handler), `builtinExtensions.main.ts` (empty list), `index.main.ts` (singleton).
- `src/extensionHost/renderer/`: `registry.renderer.ts` (generic registry + `useRegistry`), `contributions.renderer.tsx` (navigation, screens, dashboard cards, settings pages, app providers, slots, `Slot`), `ExtensionHost.renderer.ts`, `moduleLoader.renderer.ts`, `sharedModules.renderer.ts`, `ExtensionHostProvider.renderer.tsx` (gate + `useExtensions`), `builtinExtensions.renderer.ts` (empty list), `index.renderer.ts` (singleton).
- `src/extensionApi/`: `shared.ts`, `main.ts`, `renderer.ts`.
- `src/renderer/components/settings/ExtensionsSettings.tsx`.
- `docs/extensions/GUIDE.md`, `docs/extensions/examples/hello/`.

Changed Studio code:

- `src/main/main.ts` (scheme, protocol handler, extensions stopped before quit), `src/main/ipcSetup.ts` (host handlers registered last), `src/types/ipc.ts` (host channels in the union), `src/renderer/index.ejs` (CSP).
- `src/renderer/App.tsx` (provider, extension screens, `settings/:section` route, registers `@rosetta/studio-api` for the loader).
- `components/sidebar/elements.ts` and `index.tsx`, `components/commandPalette/index.tsx` and `commands.ts` (`registerCommand`), `screens/dashboard/index.tsx`, `screens/settings/index.tsx` and `settingsElements.tsx`.
- `components/fileViews/{types,registry,index,ActiveFileView}` (priority, props, removal, live), `components/terminal/panels/{registry,index}` and `terminal/index.tsx` (removal, live).
- Saved-file event fired from `main/services/projects.service.ts` (`saveFileContent`) and the AI write sites in `ai/tools/filesystem.tools.ts`, `ai/tools/dbt.tools.ts`, `ai/tools/studio/pipeline.tools.ts`.
- `.eslintrc.js` (boundary).

API implemented so far. Renderer: `navigation.addItem`, `screens.add`, `slots.add`, `dashboard.addCard`, `settings.addPage`, `app.addProvider`, `fileViews.add`, `panels.add`, `commands.add`, `ipc.invoke / on`, `bridge.handle`, `extensions.getExports`, `storage`, `log`; exports `AppLayout`, `Slot`, `useSlot`. Main: `ipc.handle / send`, `bridge.request`, `workspace.onDidSaveFile`, `storagePath`, `extensions.getExports`, `log`.

Not implemented yet (their phases): `editor.addAction`, `monaco`, renderer `files.onWillSave / onDidSave / onDidOpen / onDidClose` and the single save function (3.1), `fileTree.*` (2.1), `agents.*` (2.1 / 3.1), `connections.register` (7).

Things a later session should know:

- Internal extension channels keep their existing names and stay in the channel union in `src/types/ipc.ts`; `api.ipc.handle` registers a real `ipcMain` handler and removes it on deactivation.
- The host does not import `src/extensionApi/renderer` as a value (it pulls in the whole component barrel and breaks jest on `react-markdown`); `App.tsx` registers the API module with `registerSharedModule`.
- A screen must render inside `AppLayout`, or the previous screen's side panel stays.
- Sidebar items: Studio's use `order` 100 to 700 in the main group and 100, 200 in the bottom group.
- Installed extensions are loaded with trust confirmation at install; there is no sandbox.
