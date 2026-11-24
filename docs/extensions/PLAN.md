# Extension system: design and work plan

This file is the working record. It says what the system is, what is done and what is not.
Git is not used by the assistant in this repo, so this file is the only record of progress.

**Resuming in a new session:** read sections 1 to 3, then "Order of work" below and the progress log (section 7), run the gate (section 5) to confirm the tree is green, and continue at the next task **in the order of work, not in the numeric order of section 4**. Update the checkboxes and add a progress-log line before the session ends.

### Order of work (set by the owner, 2026-11-24)

1. **Move the existing tools first.** Phase 5 (Analytics), then phase 6 (Notebooks), then phase 7 (connections). Nothing new is added while existing tools are still being moved.
2. **Then the new things:** 3.5 (the `.sql` file handler with the compact editor) and phase 4 (dbt SQL, which builds on it).
3. **AI last, for all tools at once:** the agent contribution point with 2.9 and 3.6.
4. Phase 8 (cross-support), then phase 9 (guide finished).

How a block runs: the design questions were settled when this plan was written, so the assistant does not stop to ask for the approach again. It works a block through, keeps every existing function working, runs the gate, and reports the status with a commit message at the end. **The owner runs the app and tests it after each block; the assistant does not launch the app.** The owner's "next" starts the following block.

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
- [x] 1.11 Example extension under `docs/extensions/examples/hello/` (sidebar item, screen, command, backend call). Installed in the running app and switched on and off by the owner; it worked.
- [x] 1.12 Guide, first version: `docs/extensions/GUIDE.md`.

### Phase 2: Pipeline extension

Moves to `src/extensions/pipeline/`: `components/pipelineView/*`, `fileViews/PipelineFileView.tsx`, `fileTreeViewer/PipelineThumbnailPreview.tsx`, `modals/createPipelineModal/*`, `modals/pipelineSelectorModal/*`, `modals/runWithEnvModal/*`, `terminal/panels/RunnerLogsPanel.tsx`, `context/RunnerProvider.tsx`, `hooks/useRunnerContext.ts`, `services/pipelineTemplates.service.ts`, `settings/RunnerSettings.tsx`, `chat/pipelineToolResults.ts`; main `ipcHandlers/runner.ipcHandlers.ts`, `ipcHandlers/pipelineTemplates.ipcHandlers.ts`, `services/runner.service.ts`, `runnerEnvironment.ts`, `sparkEnvironment.ts`, `pluginManifest.service.ts`, `utils/pipelineEnvVars.ts`, `services/ai/tools/studio/pipeline.tools.ts`; shared `src/shared/pluginManifest.ts`.

**Phase 2 design, decided 2026-11-23 (read before continuing):**

- API files: `src/extensionApi/renderer.ts` holds only the contract types plus `Slot`. Pieces of Studio that extensions use are exported from small files in `src/extensionApi/studio/`, **one file per Studio module, re-exporting from exactly the module the code imported before** (also when that module is a barrel such as `renderer/controllers`). That keeps each extension file's import graph, and the `jest.mock` paths of its tests, the same as before the move. `studio/index.ts` re-exports all of them and is what installed extensions get as `@rosetta/studio-api`.
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
- [x] 2.2 The pipeline UI lives in `src/extensions/pipeline/renderer/` and registers everything in `activate(api)` (`renderer/index.ts`). Manifest: `src/extensions/pipeline/manifest.shared.ts` (id `rosetta.pipeline`, `requiresRestart`). Listed in both builtin lists (main side has no module yet). Its own service calls and hooks: `renderer/pipelineServices.ts`, `renderer/pipelineControllers.ts` (removed from Studio's `settings.controller`, `settings.services`, `projects.controller`, `projects.service`, `config/constants`). `CloudLogViewer.tsx` stayed in Studio at `components/terminal/panels/`.
- [x] 2.3 File tree: Run Pipeline buttons and thumbnail leave `TreeNode.tsx:138-154, 307, 373-420`; remove the `onRunPipeline*` props through `fileTreeViewer/index.tsx`, `ArboristTree.tsx`, `TreeNode.tsx`.
- [x] 2.4 Create Pipeline button (`sidebar/project-sidebar.tsx:384`) and its modals become a slot contribution.
- [x] 2.5 Run Pipeline entries in `dbtModelButtons/ProjectDbtSplitButton.tsx:350-373, 556-596` become contributed menu items.
- [x] 2.6 Dashboard card and the "where should the pipeline go" flow (`dashboard/index.tsx:303-318, 893-930`, `selectProject/index.tsx:106-127`, `projectDetails/index.tsx:83-92`, `project-sidebar.tsx:326-330`) become extension-owned; same screens and dialogs for the user.
- [x] 2.7 Main half lives in `src/extensions/pipeline/main/`: `index.ts` (`activate` registers 16 channels with their old names, `deactivate` stops a running pipeline), `runnerHandlers.ts`, `pipelineTemplatesHandlers.ts`, `runner.service.ts`, `runnerEnvironment.ts`, `sparkEnvironment.ts`, `pipelineEnvVars.ts`, `pipelineProjects.ts` (`listPipelines`, `extractRequiredEnvVars`, taken out of `ProjectsService`). Removed from Studio: the two handler files and their registration in `ipcHandlers/index.ts` / `ipcSetup.ts`, `RunnerService` from `services/index.ts`, the runner / kisql handlers and their names in the `handlerChannels` list of `settings.ipcHandlers.ts` (that list is removed and re-registered per window, so a name left there would delete the extension's handler), the two project handlers. Main API gained `windows.getMainWindow()` and `startup.addTask()`; area files in `src/extensionApi/studioMain/`.
- [x] 2.8 Runner set-up at boot is a start-up task of the extension. `main.ts` starts the extension host behind the splash (`startExtensionHost()`, which first installs the IPC error wrapper) and calls `extensionHost.runStartupTasks(updateMessage)` at the same point in the sequence and with the same splash message as before.
- [ ] 2.9 AI tools and guards move. **Deferred to the agent contribution point (done together with the SQL agent, phase 3).** Reason: the pipeline tools are not a separable block. They are woven into the project agent: three prompt variants name them (`ai/agents/projectAgent.ts:117-129, 248-258`), plus its read-only list, ask-mode rules and description table (`:308-365`); `agent.service.ts` has default-enabled flags (`:87-90`), tool name lists (`:273-282`), the pipeline context builder (`:1583-1590, 1687`), the disable-for-non-project cases (`:1635-1638`) and the static `listTools` entries (`:2178-2194`); `filesystem.tools.ts` and `dbt.tools.ts` call the write guard; the chat UI formats their results (`components/chat/pipelineToolResults.ts`, `ToolCallRow.tsx`, `AgentStepBlock.tsx`, `ToolCallFormatters.tsx`, `ChatWindow.tsx`, `TabsProvider.tsx`) and `AISettingsTab.tsx` lists the tool ids. Prompt text is behaviour, so the contribution point must put each extension's text at the same place in each prompt. One design has to serve the pipeline tools, the SQL agent, the notebooks agent and the analytics agent, so it is designed once, with the SQL agent. Until then `src/shared/pluginManifest.ts`, `main/services/pluginManifest.service.ts` and `RunnerRequirementStatus` stay in Studio behind the transitional `pipelineShared` API files.
- [x] 2.10 Tests moved and fixed (UI and main halves). Left for 2.9: `pipeline.tools`, `pipelineWriteGuards`, `pipelineToolResults`, `pluginManifest`.
- [x] 2.11 Guide updated (file tree, project menu, slots, Studio pieces, main half, start-up tasks).

### Phase 3: SQL extension

- [~] 3.1 API additions. **Done:** `editor.addAction` (registry `editorActions`, rendered by `components/editor/EditorActions.tsx` inside the editor header after the view's own actions); `api.monaco` (the shared namespace); the single save function is `projectsServices.saveDocument` / `saveFileContent` in `renderer/services/projects.service.ts`, which runs `files.onWillSave` participants (`extensionHost/renderer/documents.renderer.ts`: sequential, a failing or slow one is skipped, reason `manual | auto | programmatic`), writes, and tells the tabs store when a hook changed the content; `files.onDidSave` (from the main process, so it includes AI agent writes), `files.onDidOpen / onDidClose` (emitted by `TabsProvider`); main `workspace.onDidSaveFile`; renderer `bridge.handle`. **Not done:** main `agents.add` replacing the `screenKey` switch (goes with 2.9, designed with the SQL agent in 3.6).
  All renderer save paths already call `projectsServices.saveFileContent`, so they all pass through the hooks. For reference, the save paths are: `editor/index.tsx:465-509, 575-594`, `TabsProvider.tsx:172-211`, `useTabManager.ts:799-828`, `PipelineFileView` visual save, `CodeFileView.tsx:327-337`, `chat/MessageRenderer.tsx:367-385`, `chat/ChatWindow.tsx:880-900`.
- [x] 3.2 Data pieces that Notebooks and Analytics also use stay in Studio and are exported through the API when the SQL code moves. **Done:** the statement parser is `src/connections/core/sqlStatements.shared.ts` (was `sqlEditor/editorComponent/statements.ts`), so the connections layer no longer imports SQL editor code; `SchemaTreeViewerWithSchema.tsx` is in `components/schemaTreeViewer/` (was in `screens/sql/`); the AI dialogs have their own `components/modals/promptCard.styles.ts` instead of importing `sqlEditor/queryHistory/styles`. Area files for these pieces exist in `src/extensionApi/studio/` (`schemaTreeViewer`, `schemaTreeContextMenu`, `schemaObjectSql`, `schemaObjectDrop`, `sqlSchemaCompletions`, `insertText`, `queryResultVisualization`, `sqlStatements`).
- [x] 3.3 The SQL screen takes contributed tabs: `api.workspaceTabs.add(STUDIO_WORKSPACES.sql, { id, label, icon, Sidebar, Main, assistant })`, registry `workspaceTabRegistry(screenId)`. The screen keeps each tab's state by id, resets it when the connection changes, and takes the assistant (chat `screenKey`, `pageId`) from the selected tab. Analytics is such a tab: `components/analytics/workspaceTab.tsx`, registered by `components/analytics/registerWorkspaceTab.ts` (imported from `App.tsx` until phase 5). The Home Analytics card navigates with `state: { tab: 'analytics' }` (was `tab: 2`). The SQL screen has no unit tests; the tab definition has `tests/unit/renderer/components/analyticsWorkspaceTab.test.tsx`. The Notebooks screen still imports Analytics directly (phase 5 / 6).
- [x] 3.4 The SQL Editor is the internal extension `rosetta.sql` (`src/extensions/sql/`): `manifest.shared.ts`; `renderer/index.ts` registers the sidebar entry (order 300), the screen (`sql`, `assistant: true`, redirect `data-lake/history`), the Home card (order 300); `renderer/SqlScreen.tsx` (was `screens/sql/index.tsx`), `renderer/sqlEditor/`, `renderer/sqlTabs/`, the tab manager, saved-queries hooks and calls, the editor bridges. `main/index.ts` registers the four `savedQueries:*` channels; `main/savedQueries.service.ts`. Removed from Studio: the route and redirect in `App.tsx`, the `Sql` screen export, the sidebar entry, the Home card, the `/app/sql` clause for the AI button in `components/menu/index.tsx` (screens now say `assistant: true`), three lines in `components/index.ts`, one in `controllers/index.ts`, the saved-queries handler file and its registration. `ScreenDefinition` gained `assistant`. Left in Studio on purpose: `ConnectorsService` and `connector:*`, the Home Analytics card (it opens `/app/sql`), `components/sqlConnectionsSidebar` (unused, untouched), main-side AI code.
- [ ] 3.5 SQL editor exported as a reusable component with `compact`; `.sql` file handler registered (the one intended addition, section 1). **New feature: after phases 5 to 7 (order of work).**
- [ ] 3.6 AI side: SQL agent, `sql.tools.ts`, `monaco.tools.ts`; `editorBridge` and `agentEditorBridge` onto the generic bridge. **With the agent contribution point, last (order of work).** The `savedQueries` handlers and service already moved in 3.4. `ConnectorsService` and `connector:*` stay in Studio.
- [x] 3.7 Tests: `SqlEditor.errors`, `SqlTabManager.copy` point at the extension; `sqlEditorStatements` and `SchemaTreeViewerWithSchema` at their new Studio paths; `registry.test.ts` and `CommandPalette.test.tsx` add the SQL sidebar entry from `src/extensions/sql/renderer/contributions.tsx`; new `tests/unit/extensions/sql.activate.test.ts`. e2e `e2e/tests/sql-editor/*` not run by the assistant.
- [x] 3.8 Guide updated (section 4.3 workspace tabs, section 7).
- [x] 3.9 SQL-only pieces that were still in Studio moved into the extension (2026-11-24): the gutter run-icon style (`.run-query-glyph`, was in `renderer/App.css`, now `sqlEditor/editorComponent/runGlyph.css`); the types `SqlTabId`, `SqlTabState`, `SqlPendingCloseState`, `QueryHistoryType` (were in `types/editor.ts` and `types/frontend.ts`, now `renderer/types.ts`); the unused `components/sqlConnectionsSidebar` (it used `SqlTabState`; moved as it is to `renderer/sqlConnectionsSidebar/`, still unused).

### Phase 4: dbt SQL extension (depends on SQL)

After phases 5 to 7 (order of work): it builds on 3.5.

- [ ] 4.1 Read `dbtModelButtons/*`, `hooks/useProjectSqlExecution.ts`, `hooks/useProjectQueryResultsPanel.ts`, `components/projectQueryResults/*`, `context/QueryResultsProvider.tsx`, language intelligence; write the file list here.
- [ ] 4.2 Higher-priority `.sql` handler for projects with the dbt capability, reusing the SQL extension's exported editor and adding `jinja-sql`, compile-before-run, the Execute code lenses (`editor/index.tsx:309-429`), the AI menu and model button (`CodeFileView.tsx:224-315`).
- [ ] 4.3 Move `lib/monaco/jinjaSqlLanguage.ts`, `completions/jinjaSql.ts`, `completions/sqlKeywords.ts`, dbt parts of `completions/python.ts`, language intelligence (renderer and main).
- [ ] 4.4 `CodeFileView.tsx` and `editor/index.tsx` hold no SQL or dbt knowledge.
- [ ] 4.5 Project top-bar dbt button (`projectTypes/index.tsx:26-28, 59-62`) becomes a slot contribution.
- [ ] 4.6 Tests and guide.

### Phase 5: Analytics extension

- [x] 5.1 File list (71 files moved):
  - `src/renderer/components/analytics/**` (all of it except `runtime/queryDependencyResolver.ts`) to `src/extensions/analytics/renderer/`, same sub-folders (`bi/`, `components/`, `registry/`, `staticRuntime/`).
  - `renderer/utils/analyticsQueryEngine.ts`, `analyticsTree.ts` to `renderer/utils/`.
  - `renderer/controllers/analyticsPages.controller.ts`, `staticSite.controller.ts`, `renderer/services/analyticsPages.service.ts`, `analyticsEditorBridge.service.ts`, `staticSite.service.ts` to `renderer/`.
  - `src/types/staticSite.ts` to `shared/staticSite.ts`.
  - Main: `ipcHandlers/analyticsPages.ipcHandlers.ts` to `main/analyticsPagesHandlers.ts`, `ipcHandlers/staticSite.ipcHandlers.ts` to `main/staticSiteHandlers.ts`, `services/staticSite.service.ts`, `services/staticSiteTemplates.ts` to `main/`.
  - **Stays in Studio until the AI block** (the Analytics agent, its prompts and `analyticsPages.tools.ts` import it, and Studio code cannot import from an extension): `src/shared/analyticsBi/**`; `main/services/analyticsPages.service.ts`; and what `analyticsBi` itself imports: `renderer/components/analytics/runtime/queryDependencyResolver.ts`, `renderer/utils/analyticsMarkdown.ts`, `renderer/utils/analyticsComponentProps.ts`. The extension reaches them through transitional API files marked "Transitional": `extensionApi/studio/{analyticsBi,analyticsBiExpressions,analyticsQueryReferences,analyticsMarkdown,analyticsComponentProps}.ts` and `extensionApi/studioMain/{analyticsBi,analyticsPagesService,analyticsQueryReferences}.ts`. They move, and those files are deleted, with the agent.
  - Stays in Studio for good: `src/types/analyticsPages.ts` (Studio's database stores the pages: `mainDatabase.service.ts`), the channel names in `types/ipc.ts`, the backup category, `main/services/analytics.service.ts` (that one is app update tracking, not Analytics pages).
- [x] 5.2 Analytics is the internal extension `rosetta.analytics` (`src/extensions/analytics/`): `manifest.shared.ts` (live enable / disable, no dependencies); `renderer/index.ts` adds the Analytics tab to the SQL Editor and Notebooks screens and the Home card (`renderer/contributions.tsx`, order 400, `onSelect` opens `/app/sql` with `state: { tab: 'analytics' }`); `main/index.ts` registers the 5 `analyticsPages:*` and 8 `analytics:static-site:*` channels with their old names (the build takes the window from `api.windows.getMainWindow()`). Changes in Studio:
  - The Notebooks screen is a workspace like the SQL screen: `STUDIO_WORKSPACES.notebooks`; `screens/notebooks/index.tsx` and `components/notebook/NotebooksSidebar.tsx` render the contributed tabs after their own two (Notebooks, Data), keep each tab's state by id, reset it when the connection changes, and take the assistant from the selected tab. Neither imports Analytics any more.
  - `WorkspaceTabProps` gained `onSchemaChange` (Notebooks passes its schema refresh, as it did to the Analytics editor before; the SQL screen passes none, as before).
  - Removed from Studio: the Analytics card and its special case in `screens/dashboard/index.tsx`, `registerWorkspaceTab.ts` and its import in `App.tsx`, the controller line in `controllers/index.ts`, the two handler registrations in `ipcHandlers/index.ts` and `ipcSetup.ts`. The old barrel `components/analytics/index.ts` had only the Notebooks screen as a user; its place (`renderer/index.ts`) is now the extension entry.
  - `scripts/build-analytics-runtime.mjs` builds from `src/extensions/analytics/renderer/staticRuntime/`. Checked with a build to the temp folder: it bundles, and reaches only the Analytics files, `shared/analyticsBi`, the chart renderer and the chart data transformer (no Studio barrel).
  - New API files: `studio/{chartRenderer,chartDataTransformer,icons,analyticsPagesTypes}.ts`, `studioMain/{connectorsService,duckLakeService,mainDatabaseService,analyticsPagesTypes}.ts`; `studio/hooks.ts` and `studio/connectorsService.ts` export three more names.
  - Not moved (AI block): the Analytics agent, prompts and tools, the chat's `analytics` screen key, the main side of the editor bridge.
- [x] 5.3 Tests: the Analytics, static site and workspace tab tests point at the extension; new `tests/unit/extensions/analytics.activate.test.ts` (manifest, tab on both screens, Home card and what it opens, the 13 channels). Guide: section 4.3 and section 7.

### Phase 6: Notebooks extension

- [ ] 6.1 Host events that break the circular imports: connection deleted (today `connectors.service.ts:475`, `duckLake.service.ts:763`). **Goes with the move of the notebook services (AI block).** Both calls archive the connection's notebooks and must be able to stop the deletion when that fails, so the event has to be an awaited "will delete" that can refuse. While `notebooks.service.ts` is still in Studio the direct call stays.
- [x] 6.2 The Notebooks UI is the internal extension `rosetta.notebooks` (`src/extensions/notebooks/`, 2026-11-24): `manifest.shared.ts` (live enable / disable); `renderer/index.ts` registers the sidebar entry (order 400), the screen (`notebooks`, `assistant: true`) and the Home card (`notebook`, order 200), all in `renderer/contributions.tsx`. Moved (40 files): `screens/notebooks/index.tsx` to `renderer/NotebooksScreen.tsx`; `components/notebook/**` to `renderer/notebook/**`; `hooks/useNotebookBridge`, `useNotebookConnectionState`, `useNotebookSidebarState`, `useNotebookTabManager`, `usePythonNotebookAgentBridge` to `renderer/hooks/`; `controllers/{notebooks,pythonNotebooks}.controller.ts` and `services/{notebooks,pythonNotebooks,notebookBridge,pythonNotebookBridge}.service.ts` to `renderer/`. Removed from Studio: the route in `App.tsx`, the `Notebooks` screen export, the sidebar entry, the Home card, the `/app/notebooks` clause for the AI button in `components/menu/index.tsx`, the two hook exports in `hooks/index.ts`, the controller line in `controllers/index.ts`.
  - `PythonMonoIcon` is Studio's: `components/icon/PythonMonoIcon.tsx` (settings, status bar and set-up use it; the kernel bar gets it through the API).
  - **Not moved:** `renderer/utils/notebookConnectionTransfer.ts`. Studio's `controllers/connectors.controller.ts` uses it (importing a connection with its credentials), so it is connections code; the extension gets `resolveConnectionCredentials` through `extensionApi/studio/connectionCredentialTransfer.ts`.
  - New API files: `studio/{pythonMonoIcon,customTablePagination,useLocalStorage,useSecureStorage,connectionCredentialTransfer,schemaDragPayload,notebooksTypes,pythonNotebooksTypes}.ts`; `studio/{sqlSchemaCompletions,sidebarIcons,controllers}.ts` export one more name each.
- [~] 6.3 Main half. **Done:** `ipcHandlers/notebooks.ipcHandlers.ts` and `pythonNotebooks.ipcHandlers.ts` are `main/notebooksHandlers.ts` and `main/pythonNotebooksHandlers.ts`; `main/index.ts` registers the 18 `notebooks:*`, 2 `pythonRuntimes:*` and 22 `pythonNotebooks:*` channels with their old names; the kernel shutdown on quit is the extension's `deactivate` (awaited by the host before the app exits; it also runs when the extension is switched off). **Stays in Studio until the AI block** (the Notebooks agent and `pythonNotebook.tools.ts` import them, and Studio code cannot import from an extension): `services/notebooks.service.ts`, `pythonNotebooks.service.ts`, `notebookKernel.service.ts`, `notebookEnv.service.ts`, `src/shared/notebookAgentSummary.ts`. The extension reaches them through transitional API files: `extensionApi/studioMain/{notebooksService,pythonNotebooksService,notebookEnvService,notebookKernelService}.ts` and `extensionApi/studio/notebookAgentSummary.ts`. `PythonRuntimesService` stays in Studio for good (`studioMain/pythonRuntimesService.ts`); so do `types/notebooks.ts` and `types/pythonNotebooks.ts` (the services, the agent and `pythonRuntimes.service.ts` use them). `resources/python/notebook_kernel_bridge.py`: nothing changed, the service that starts it did not move.
- [ ] 6.4 Bridges onto the generic bridge; agent through `agents.add`. **AI block.** The renderer side of the bridges moved with the UI as it is.
- [x] 6.5 Studio services that read notebook folders keep working: nothing changed for `backup.service.ts`, `settings.service.ts`, `secondBrainRefresh.service.ts`, because the notebook services they use are still in Studio. To be looked at again when those services move.
- [x] 6.6 Tests: `pythonNotebooks.ipcHandlers` registers through the extension API and checks the kernel shutdown on `deactivate`; `DataFrameTableOutput`, `PythonTextCell`, `markdownFormatting` point at the extension; `registry.test.ts` and `dashboard.panels.test.tsx` add the Notebooks sidebar entry and Home card from the extension; new `tests/unit/extensions/notebooks.activate.test.ts`. The service tests (`pythonNotebooks.service`, `notebookEnv.service`, `oracleNotebooks`) are unchanged. Not run by the assistant: `tests/python/test_notebook_kernel_bridge.py`, e2e `e2e/tests/notebooks/notebooks.spec.ts`.
- [x] 6.7 Guide updated (section 7).

### Phase 7: connections as an interface

- [x] 7.1 Impact read (2026-11-24). The connections layer was already built around three typed maps (`registry.shared.ts` descriptors, `registry.main.ts` connectors, `registry.renderer.ts` UIs) and **every caller goes through their lookup functions** (`getDescriptor`, `getConnector`, `requireConnector`, `getConnectionUi`, `creatableConnections`, ...); nothing outside the three registry files reads the maps or `CONNECTION_TYPES`, and no service or screen switches on a database type (the literal type checks left in the code are DuckLake / Iceberg catalog types, a different thing). `SupportedConnectionTypes`, `ConnectionInput` and `DBTConnection` stay closed unions of Studio's own databases: they are compile-time types; a database added at run time is a plain string type at run time and needs no change to them. `connectors.service.ts:35-40` still imports three adapter internals (Oracle wallet aliases, DuckDB create, Snowflake session); they are features of those built-in databases and are not in the way.
- [x] 7.2 `connections.register`. The lookups read run-time registries: `registerDescriptor` (`registry.shared.ts`), `registerConnector` (`core/connectorRegistry.main.ts`), `registerConnectionUi` (`core/uiRegistry.renderer.ts`). **The twelve built-in databases register through those same calls** from the typed maps (which stay, so a missing built-in still fails tsc). Each returns the function that takes the database out again; a type that is taken is refused. API: main `api.connections.register(definition | Connection)`, where a definition is a plain object (`descriptor`, `validate`, `test`, `query`, `extractSchema`, optional `sameTarget`, `nameHint`, `agentHint`, `validatesOnSave`, `dispose`) because an installed extension cannot extend Studio's `Connection` class; renderer `api.connections.register({ descriptor, ui })`. `completeExtensionDescriptor` fills what the descriptor leaves out and forces `dbt` / `dbtV2` off. Also changed: the add-connection screen reads its tiles when it opens (it read them once at app load); an extension database without `sqlEditorInput` gives the SQL Editor its saved settings. Form building blocks exported: `studio/connectionForm.ts`, four more hooks in `studio/controllers.ts`. **Not in the API yet:** dbt for extension databases (needs a dbt connector: profiles, adapter install); connections of a disabled extension stay listed as an unknown type (same as a removed built-in type).
- [x] 7.3 Proof: `docs/extensions/examples/clickhouse/` (`package.json`, `main.js`, `renderer.js`, no dependencies, ClickHouse over HTTP). `tests/unit/extensions/clickhouseExample.test.ts` installs it from its folder through the real host and uses it through `ConnectorsService` (test, query, error, tables), then uninstalls it; `clickhouseExampleForm.test.tsx` loads its UI script the way the loader does and drives the form. Its main half was also run once against ClickHouse's public demo server (`play.clickhouse.com`, port 443, TLS, user `play`, no password): test, query, error text and 99 tables came back as expected. **For the owner to do in the app:** Settings → Extensions → Install from folder → that folder.
- [x] 7.4 Guide updated (section 4.8, main API table, examples).

Tests: `tests/unit/connections/extensionConnection.test.ts` (through the main host: used by the service calls, defaults, type conflict, missing function), `extensionConnectionUi.test.tsx` (through the renderer host: tile order, form, icon, label, conflict).

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
| 2026-11-24 | **Connections are an interface (phase 7).** Databases register at run time; the built-in twelve use the same call; `api.connections.register` on both halves; ClickHouse example extension as the proof. Gate: tsc 0, lint 0, jest 240 suites / 2329 tests, main and renderer production bundles build. Not run in the live app by the assistant; the owner tests it. **All phases of "move the existing tools" are done.** What is left, in the owner's order: (1) the new things: 3.5 (`.sql` file handler) and phase 4 (dbt SQL); (2) the AI block: the agent contribution point with 2.9, 3.6, the Analytics and Notebooks agents and the services held back for them (5.1, 6.1, 6.3, 6.4); (3) phase 8; (4) phase 9. |
| 2026-11-24 | **Notebooks moved and running as an internal extension (phase 6: UI, handlers, kernel shutdown).** Its four backend services stay in Studio until the AI block (6.1, 6.4 and the rest of 6.3). Gate: tsc 0, lint 0, jest 236 suites / 2318 tests, main and renderer production bundles build. Not run in the live app by the assistant; the owner tests it. **Next (owner's "next"): phase 7, connections,** starting at 7.1. |
| 2026-11-24 | **Analytics moved and running as an internal extension (phase 5), SQL leftovers moved (3.9), order of work recorded.** Gate: tsc 0, lint 0, jest 235 suites / 2315 tests, main and renderer production bundles build, static site runtime bundles. Not run in the live app by the assistant; the owner tests it. **Next (owner's "next"): phase 6, Notebooks,** starting at 6.1. |
| 2026-11-23 | Code read, baseline recorded, plan written. |
| 2026-11-25 | **SQL Editor moved and running as an internal extension (3.4, 3.7).** Gate: tsc 0, lint 0, jest 234 suites / 2311 tests, main and renderer production bundles build. Not run in the live app by the assistant. **Next, in this order:** (1) 3.5: export the SQL editor as a reusable component with `compact` and register the `.sql` file handler. Facts for the design: project `.sql` files open today in `components/fileViews/CodeFileView.tsx` through the tabs-aware `Editor` (breadcrumb, Save, git diff); the SQL screen's editor is `src/extensions/sql/renderer/sqlEditor/editorComponent` (Monaco with a run icon per statement, schema completions, drag-drop) driven by `sqlEditor/index.tsx` (`SqlEditor`, runs through `connectorsServices.executeQueryForConnection`, reports results through props); project query results already have a bottom panel (`context/QueryResultsProvider.tsx`, `components/projectQueryResults/`). The handler must keep the tab model (content, dirty state, Save, breadcrumb) and run against the project's connection, showing results in that panel. For dbt projects nothing changes until phase 4. (2) 3.6 with 2.9: the agent contribution point; then move `ai/agents/sqlAgent.ts`, `ai/tools/studio/sql.tools.ts`, `monaco.tools.ts` and the pipeline tools. |
| 2026-11-25 | **3.2 (in part) and 3.3 done.** Gate: tsc 0, lint 0, jest 233 suites. **Next: 3.4, move the SQL code** (23 files: `screens/sql/{index,queryResult,queryResultStore,styles}`, `components/sqlEditor/*`, `components/sqlTabs/*`, `hooks/useSqlTabManager.ts`, `controllers/{savedQueries,editor}.controller.ts`, `services/{savedQueries,editorBridge,agentEditorBridge}.service.ts`) with the same scripted approach as Pipeline. Still to solve at the move: the screen's AI button is chosen by pathname in `components/menu/index.tsx:179-183` (add `assistant` to `ScreenDefinition`), and `ChatWindow`, `AppContext`, `PanelHeaderDropdown`, `ErrorMessage`, `CustomTable`, `TabContextMenu`, `Shimmer`, DuckLake and connector services need area files. |
| 2026-11-24 | **Editor injection points (3.1, except the agent point).** Gate: tsc 0, lint 0, jest 232 suites / 2304 tests. New tests: `tests/unit/extensionHost/documents.test.tsx`, `tests/unit/renderer/context/TabsProvider.fileEvents.test.tsx`; `TabsProvider.save.test.tsx` now stubs `saveDocument`. Every capability in section 1's list now has an injection point; what remains is converting SQL, dbt SQL, Analytics and Notebooks onto them, the agent contribution point (2.9 / 3.6), and connections (phase 7). **Next: 3.2.** |
| 2026-11-24 | **Main half of Pipeline moved (2.7, 2.8).** Gate: tsc 0, lint 0, jest 230 suites / 2292 tests, main and renderer production bundles build. New test `tests/unit/extensions/pipeline.main.test.ts`. Runner tests point at the new paths. `.eslintrc.js`: the extension zone allows `src/node_modules` (a link to the native npm packages). Still in Studio and reached through the two transitional `pipelineShared` API files: `src/shared/pluginManifest.ts`, `main/services/pluginManifest.service.ts`, `RunnerRequirementStatus` in `types/backend.ts`. **Next: 2.9 (AI tools, write guards, chat tool results), then delete the transitional files and move that shared code into the extension.** |
| 2026-11-24 | **Renderer half of Pipeline moved and running as an internal extension.** 36 files moved; 29 area files in `src/extensionApi/studio/`. Gate: tsc 0, lint 0 (boundary rule holds for the extension), jest 229 suites / 2286 tests, renderer production bundle builds. New test `tests/unit/extensions/pipeline.activate.test.ts` activates the extension through the real renderer host and checks every contribution appears and is removed. Tests moved to new paths: `StepEditDialog`, `pipelineDesignerRoundTrip`, `getPipelineRelativeName`, `pipelineContributions`, the dashboard and flow tests. Still in Studio: `src/shared/pluginManifest.ts`, `RunnerRequirementStatus`, reached through the transitional `extensionApi/studio/pipelineShared.ts`; `components/chat/pipelineToolResults.ts`. **Next: 2.7 main half.** |
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
